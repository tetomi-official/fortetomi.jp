-- ===================================================================
-- Migration 13: Stripe（Connect + Payments）を PAY.jp と併存させる — PB-036 / Stripe S1
--
-- 目的:
--   決済会社を環境変数ひとつで PAY.jp / Stripe に切り替えられるようにする。
--   そのため既存の列は一切消さず、Stripe 用の列と表を「足すだけ」にする。
--   どちらの決済会社に倒しても、もう片方のデータが壊れないことを最優先にした。
--
-- 設計上の判断（あとで読む人向け）:
--  1) payment_customers は「1ユーザー1行」を維持し、決済会社ごとのIDを別列に持つ。
--     provider 列は「最後にどちらで登録したか」の記録用であって、判定には使わない。
--     判定は常に「その決済会社のIDが入っているか」で行う（lib/payment-provider/types.ts
--     の hasUsableCard）。こうしておくと切り替えがどちら向きでも壊れない。
--
--  2) reservations.charge_id は Stripe でも「支払い(ch_)のID」を入れ続ける。
--     PaymentIntent(pi_) は payment_intent_id に入れる。
--     ※ charge_id に pi_ を入れてはいけない。app/checkout/[reservationId]/page.tsx が
--       charge_id の有無で「決済済み」を判定しており、mypage も chargeId を見ている。
--
--  3) 出品者の Stripe 連結アカウント(acct_)は profiles_private に置かず専用表に隔離する。
--     profiles_private は本人が更新できる列を持つため、acct_ を書き換えられると
--     「他人の出品の売上を自分の口座へ向ける」攻撃が成立してしまう。
--     migration 9 が payjp_customer_id を専用表に隔離したのと同じ理由。
--     さらに stripe_account_id 自体は authenticated に見せない（ブラウザに acct_ が
--     渡る必要がない。オンボーディングのリンクはサーバーで発行する）。
--     ※ この結果、クライアントから connect_accounts を select("*") すると 403 になる。
--       列を明示して取得すること。
--
-- 適用順序: ... → migration-12 → この #13。
-- ※ Supabase SQL Editor は全体を1トランザクションで実行するため、途中エラーで全ロールバック。
-- ※ 冪等（複数回流しても同じ結果）。
-- ===================================================================

-- 1) payment_customers: Stripe 用の列を追加 ------------------------------------------

-- Stripe だけで登録した買い手は PAY.jp のIDを持たない。NOT NULL のままだと行を作れない。
alter table public.payment_customers alter column payjp_customer_id drop not null;

alter table public.payment_customers add column if not exists provider                 text not null default 'payjp';
alter table public.payment_customers add column if not exists stripe_customer_id       text;
alter table public.payment_customers add column if not exists stripe_payment_method_id text;

alter table public.payment_customers drop constraint if exists payment_customers_provider_chk;
alter table public.payment_customers add  constraint payment_customers_provider_chk
  check (provider in ('payjp','stripe'));

-- どちらのIDも入っていない空行を作らせない。
alter table public.payment_customers drop constraint if exists payment_customers_any_id_chk;
alter table public.payment_customers add  constraint payment_customers_any_id_chk
  check (payjp_customer_id is not null or stripe_customer_id is not null);

-- 同じ Stripe Customer が複数ユーザーに紐づくのは異常。
create unique index if not exists payment_customers_stripe_customer_uniq
  on public.payment_customers (stripe_customer_id) where stripe_customer_id is not null;

comment on column public.payment_customers.provider is
  '最後にカード登録した決済会社（payjp / stripe）。記録用であって、課金可否の判定には使わない。';
comment on column public.payment_customers.stripe_customer_id is 'Stripe Customer(cus_)。service_role のみ書き込み。';
comment on column public.payment_customers.stripe_payment_method_id is
  'Stripe PaymentMethod(pm_)。受け渡し時のオフセッション課金で使う保存済みカード。';

-- SELECT 権限を「IDを含まない列」だけに絞る。
-- カード登録済みかの判定は GET /api/payments/status（サーバー側）に移したので、
-- ブラウザが cus_ / pm_ を読む必要はもう無い。
revoke select on public.payment_customers from authenticated;
grant  select (user_id, provider, created_at, updated_at) on public.payment_customers to authenticated;

-- 2) reservations: 決済の記録用の列を追加 ---------------------------------------------
--    ※ grant は不要。docs/supabase-setup.sql で reservations の UPDATE は
--      「status, proposed_date, proposed_time, proposed_location」だけに絞って
--      grant し直しているため、ここで足した列は自動的に service_role 専用になる。
--      （grant 文が無いのは書き忘れではない）

alter table public.reservations add column if not exists payment_provider   text;
alter table public.reservations add column if not exists payment_intent_id  text;
alter table public.reservations add column if not exists payment_status     text;
alter table public.reservations add column if not exists payment_error_code text;

alter table public.reservations drop constraint if exists reservations_payment_provider_chk;
alter table public.reservations add  constraint reservations_payment_provider_chk
  check (payment_provider is null or payment_provider in ('payjp','stripe'));

alter table public.reservations drop constraint if exists reservations_payment_status_chk;
alter table public.reservations add  constraint reservations_payment_status_chk
  check (payment_status is null or payment_status in ('requires_action','failed','disputed'));

-- 同じ PaymentIntent が複数予約に紐づくのは異常（二重課金の検出にもなる）。
create unique index if not exists reservations_payment_intent_uniq
  on public.reservations (payment_intent_id) where payment_intent_id is not null;

create index if not exists reservations_charge_id_idx on public.reservations (charge_id);

comment on column public.reservations.charge_id is
  '支払いID。PAY.jp は Charge ID、Stripe は PaymentIntent.latest_charge(ch_)。pi_ は入れない。';
comment on column public.reservations.payment_provider is '決済に使った会社（payjp / stripe）。';
comment on column public.reservations.payment_intent_id is 'Stripe PaymentIntent(pi_)。PAY.jp では null。';
comment on column public.reservations.payment_status is
  '課金が成立しなかったときの状態。requires_action=本人認証待ち / failed=拒否 / disputed=チャージバック。成立時は null。';
comment on column public.reservations.payment_error_code is '拒否コード（card_declined 等）。運営の調査用。';

-- 3) connect_accounts: 出品者の Stripe 連結アカウント -----------------------------------

create table if not exists public.connect_accounts (
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled   boolean not null default false,  -- 課金を受けられるか
  payouts_enabled   boolean not null default false,  -- 入金を受けられるか
  details_submitted boolean not null default false,  -- 本人確認の入力を出し切ったか
  requirements_due  text[]  not null default '{}',   -- requirements.currently_due（不足項目）
  disabled_reason   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.connect_accounts enable row level security;

-- 本人の行の SELECT のみ。INSERT/UPDATE/DELETE のポリシーは作らない＝ service_role 専用。
drop policy if exists "own connect account is viewable" on public.connect_accounts;
create policy "own connect account is viewable"
  on public.connect_accounts for select
  using ((select auth.uid()) = user_id);

-- 既定 grant の是正。stripe_account_id は意図的に含めない（上の設計判断3を参照）。
revoke all on public.connect_accounts from anon, authenticated;
grant select (user_id, charges_enabled, payouts_enabled, details_submitted,
              requirements_due, disabled_reason, created_at, updated_at)
  on public.connect_accounts to authenticated;

comment on table public.connect_accounts is
  '出品者の Stripe 連結アカウント(acct_)と受取可否。書き込みは service_role のみ（他人の出品の売上を横取りされないため）。';
comment on column public.connect_accounts.stripe_account_id is
  'Stripe Connect の連結アカウント(acct_)。authenticated には grant しない＝ブラウザからは読めない。';
comment on column public.connect_accounts.requirements_due is
  'Stripe が追加提出を求めている項目。空なら不足なし。account.updated Webhook で更新する。';
