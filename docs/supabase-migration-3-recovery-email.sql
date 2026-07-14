-- ============================================================================
-- TETOMI マイグレーション #3：復旧用アドレス（recovery_email）＋ ロックアウト救済
--
-- 方針転換 B → C：大学メールをログインID（auth.users.email）のまま在籍中ずっと使う。
--   卒業で大学メールが失効する前に、本人が個人メールへセルフ切替する。
--   切替を忘れてロックアウトした場合の救済のため、登録時に取得する個人メールを
--   profiles_private.recovery_email として恒久保存し、そこ宛のワンタイムトークンで
--   ログインメールを差し替えられるようにする。
--
-- 適用：Supabase ダッシュボード → SQL Editor に全文貼り付けて Run。
-- 冪等：何度流しても同じ最終状態になる。
-- 前提・適用順序：supabase-setup.sql（#1）→ migration-2-profiles-private.sql（#2）→ 本ファイル（#3）。
--   ※ #2 適用後に #1 を単独再実行しないこと（PII列・public_profiles ビューが復活する）。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) 復旧用アドレス列。登録時の個人メールをここに保持する（PII なので private 側）。
--    ・切替のデフォルト候補
--    ・大学メール失効後のロックアウト救済の送信先
-- ----------------------------------------------------------------------------
alter table public.profiles_private add column if not exists recovery_email text;

-- 旧方針B の pending_personal_email（＝登録時の個人メール）が残っていれば移送する。
-- pending_personal_email は「email_change 進行中の一時保管」として引き続き残す。
update public.profiles_private
  set recovery_email = coalesce(recovery_email, pending_personal_email)
  where recovery_email is null and pending_personal_email is not null;

-- 本人が復旧用アドレスを編集できるようにする（university_email は引き続き書き換え不可）。
grant update (gender, recovery_email) on public.profiles_private to authenticated;

-- ----------------------------------------------------------------------------
-- B) 新規登録トリガー：metadata の recovery_email を profiles_private に書き込む。
--    ※ この時点で auth.users.email = 大学メール（＝ログインID）。
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, university, faculty, grade)
  values (
    new.id,
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'university',
    new.raw_user_meta_data ->> 'faculty',
    new.raw_user_meta_data ->> 'grade'
  );
  insert into public.profiles_private (id, university_email, recovery_email, gender)
  values (
    new.id,
    new.email,                                    -- 大学メール（＝ログインID）
    new.raw_user_meta_data ->> 'recovery_email',  -- 復旧用の個人メール
    new.raw_user_meta_data ->> 'gender'
  );
  return new;
end;
$$;

-- トリガー専用関数は RPC 面から外す（#2 と同様。再実行で PUBLIC 既定 GRANT を剥奪し直す）。
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- C) ログインメール復旧のワンタイムトークン表（enrollment_reverifications と同型）。
--    クライアントからは触らせない（RLS 有効＋ポリシー無し＝Service Role 専用）。
--    発行・検証は admin クライアントを使うサーバールートのみが行う。
-- ----------------------------------------------------------------------------
create table if not exists public.email_recovery_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists email_recovery_user_idx
  on public.email_recovery_requests (user_id, created_at desc);
create index if not exists email_recovery_token_idx
  on public.email_recovery_requests (token_hash);

alter table public.email_recovery_requests enable row level security;
-- ポリシーは一切作らない（Service Role のみがアクセスできる）。
revoke all on table public.email_recovery_requests from anon, authenticated;
