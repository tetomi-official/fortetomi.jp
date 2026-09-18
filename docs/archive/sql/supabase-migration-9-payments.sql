-- ===================================================================
-- Migration 9: 決済（PAY.jp）Phase 1 — 課金結果の永続化 + カード保存 + QR受け渡し
-- PB-036。既存の番号付きマイグレーション流儀（idempotent な alter/create if not exists、
-- RLS + 列/テーブル grant、public への既定 grant 剥奪）に合わせる。
--
-- 資金フローは Model A（プラットフォーム着金・手動送金）。Payouts型（出品者テナント）へ
-- 移行する場合は別マイグレーションで tenant_id / platform_fee 等を追加する。
--
-- 適用順序: supabase-setup.sql(#1) → migration-2 → ... → この #9。
-- ※ Supabase SQL Editor は全体を1トランザクションで実行するため、途中エラーで全ロールバック。
-- ===================================================================

-- 1) reservations に決済結果・QRワンタイムトークンのハッシュを追加 --------------------
--    charge_id / paid_at / payment_nonce_hash は authenticated の UPDATE 列 grant
--    （status, proposed_* のみ）に含めない＝ユーザーは書き換え不可。
--    書き込みは service_role（app/api/payments/* の admin クライアント）だけが行う。
alter table public.reservations add column if not exists charge_id          text;
alter table public.reservations add column if not exists paid_at            timestamptz;
-- 受け渡し時の QR に載せる「生の nonce」の SHA-256。生値は DB に保存しない（再認証トークンと同流儀）。
alter table public.reservations add column if not exists payment_nonce_hash text;

comment on column public.reservations.charge_id is 'PAY.jp Charge ID（決済成功時に service_role が記録）';
comment on column public.reservations.paid_at is '決済完了時刻（service_role が記録）';
comment on column public.reservations.payment_nonce_hash is '受け渡しQRワンタイムトークンの SHA-256。買い手がQR表示時に発行、決済成功で null 化。';

-- 2) 買い手の PAY.jp Customer 保存先 -------------------------------------------------
--    payjp_customer_id をユーザーが書けると「他人の cus_ を指す→他人のカードに課金」が
--    可能になるため、profiles_private ではなく専用表に隔離し、書き込みは service_role のみ。
--    本人は自分の行の SELECT だけ可能（UIで「カード登録済みか」を判定するため）。
create table if not exists public.payment_customers (
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  payjp_customer_id text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.payment_customers enable row level security;

-- SELECT は本人の行のみ。INSERT/UPDATE/DELETE のポリシーは作らない＝ service_role 専用。
drop policy if exists "own payment customer is viewable" on public.payment_customers;
create policy "own payment customer is viewable"
  on public.payment_customers for select
  using ((select auth.uid()) = user_id);

-- 既定 grant の是正：anon は不要、authenticated は SELECT のみ（書き込みは service_role）。
revoke all on public.payment_customers from anon, authenticated;
grant select on public.payment_customers to authenticated;

comment on table public.payment_customers is '買い手の PAY.jp Customer(cus_) 保存先。書き込みは service_role のみ（他人のカードへの課金を防ぐ）。';
