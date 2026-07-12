-- ===================================================================
-- Migration 12: レート制限（自社 API の過剰アクセス抑止）— PB-036 Phase 3
-- Vercel はサーバーレスで実行インスタンスをまたぐため、メモリ上カウンタは効かない。
-- 既存 Supabase に「原子的カウンタ」を置き、決済・再認証 API のスパイクを抑える。
--
-- 設計:
--  - rate_limits: bucket ごとに現在ウィンドウのカウント。RLS 有効・ポリシー無し＝ service_role 専用
--    （payment_customers と同じ隔離思想。ユーザーは一切触れない）。
--  - check_rate_limit(): 単一の upsert（insert ... on conflict do update ... returning）で
--    原子的にインクリメント／ウィンドウ超過時リセットし、許可なら true を返す。
--    read-modify-write の競合を避けるため、判定は必ずこの関数（1文）で完結させる。
--  - security definer: RLS をバイパスして rate_limits を更新するため。search_path を固定して安全化。
--
-- 適用順序: ... → migration-11 → この #12。
-- ※ Supabase SQL Editor は全体を1トランザクションで実行するため、途中エラーで全ロールバック。
-- ===================================================================

-- 1) カウンタ表 ---------------------------------------------------------------------
create table if not exists public.rate_limits (
  bucket       text primary key,          -- 例: 'charge:<uuid>' / 'reverify-confirm:<ip>'
  count        int not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limits enable row level security;
-- ポリシーを作らない＝ service_role 以外はアクセス不可。念のため既定 grant も剥奪。
revoke all on public.rate_limits from anon, authenticated;

comment on table public.rate_limits is 'レート制限の原子的カウンタ。service_role 専用（check_rate_limit 経由でのみ更新）。';

-- 2) 原子的な判定関数 ---------------------------------------------------------------
--    戻り値: 許可なら true（count <= p_limit）、超過なら false。
create or replace function public.check_rate_limit(
  p_bucket text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.rate_limits as rl (bucket, count, window_start)
  values (p_bucket, 1, now())
  on conflict (bucket) do update
    set
      -- ウィンドウを過ぎていれば 1 にリセット、以内なら +1。
      count = case
        when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
        else rl.count + 1
      end,
      window_start = case
        when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
        else rl.window_start
      end
  returning rl.count into v_count;

  -- 掃除（放置しない）: 呼び出しのたびに ~1% の確率で、古い期限切れ行をまとめて削除。
  -- bucket はユーザー/IP ごとに増えるため、これでテーブルの無限増殖を止める。
  -- ※ より確実にしたい場合は pg_cron で日次クリーンアップも張れる（任意・下記コメント参照）:
  --     select cron.schedule('rate_limits_cleanup', '0 4 * * *',
  --       $$delete from public.rate_limits where window_start < now() - interval '1 day'$$);
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_limit;
end;
$$;

comment on function public.check_rate_limit(text, int, int) is
  'bucket を原子的にインクリメントし、ウィンドウ内カウントが上限以下なら true を返す。lib/rate-limit.ts から呼ぶ。';

-- 関数の実行は service_role のみ（app の admin クライアント）。anon/authenticated には与えない。
revoke all on function public.check_rate_limit(text, int, int) from anon, authenticated;
