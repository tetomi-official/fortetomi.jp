-- ============================================================================
-- TETOMI マイグレーション #4：復旧用アドレスの検証（recovery_email_verified）
--
-- 目的：登録時に収集する個人メール（profiles_private.recovery_email）を、
--   「本人が本当に受信できるアドレスか」を別途ワンタイムトークンで検証できるようにする。
--   検証済みのアドレスだけを、大学メール失効後のロックアウト救済の送信先として信頼する。
--   （検証は登録では強制せず、マイページからの手動送信＋バナー催促で促す方針。）
--
-- 適用：Supabase ダッシュボード → SQL Editor に全文貼り付けて Run。
-- 冪等：何度流しても同じ最終状態になる。
-- 前提・適用順序：#1 → #2 → #3（recovery-email）→ 本ファイル（#4）。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) 検証状態の列。ユーザーには UPDATE 権限を渡さない（＝自己検証を防ぐ）。
--    更新は Service Role（confirm ルート）のみが行う。
-- ----------------------------------------------------------------------------
alter table public.profiles_private
  add column if not exists recovery_email_verified boolean not null default false;
alter table public.profiles_private
  add column if not exists recovery_email_verified_at timestamptz;

-- grant は #2/#3 のまま（gender, recovery_email のみ）。verified 列は付与しない。

-- ----------------------------------------------------------------------------
-- B) 復旧用アドレスが変わったら検証状態をリセットする BEFORE UPDATE トリガー。
--    ユーザーが recovery_email を書き換えたのに古い verified が残るのを防ぐ。
-- ----------------------------------------------------------------------------
create or replace function public.reset_recovery_email_verified()
returns trigger
language plpgsql
as $$
begin
  if new.recovery_email is distinct from old.recovery_email then
    new.recovery_email_verified := false;
    new.recovery_email_verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_recovery_email_verified on public.profiles_private;
create trigger trg_reset_recovery_email_verified
  before update on public.profiles_private
  for each row
  execute function public.reset_recovery_email_verified();

-- トリガー専用関数は RPC 面から外す（#2/#3 と同様）。
revoke execute on function public.reset_recovery_email_verified() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- C) 復旧用アドレス検証のワンタイムトークン表（email_recovery_requests と同型）。
--    クライアントからは触らせない（RLS 有効＋ポリシー無し＝Service Role 専用）。
-- ----------------------------------------------------------------------------
create table if not exists public.recovery_email_verifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists recovery_email_verif_user_idx
  on public.recovery_email_verifications (user_id, created_at desc);
create index if not exists recovery_email_verif_token_idx
  on public.recovery_email_verifications (token_hash);

alter table public.recovery_email_verifications enable row level security;
-- ポリシーは一切作らない（Service Role のみがアクセスできる）。
revoke all on table public.recovery_email_verifications from anon, authenticated;
