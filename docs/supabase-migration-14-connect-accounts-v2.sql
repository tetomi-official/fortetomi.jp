-- ===================================================================
-- Migration 14: connect_accounts を Stripe Accounts v2 の形に合わせる — Stripe S3
--
-- 背景:
--   migration-13 で作った connect_accounts は Stripe の Accounts v1 を前提にしていた
--   （charges_enabled / payouts_enabled / details_submitted という真偽値）。
--   しかし Stripe は新規 Connect 連携での v1 を廃止しており、実際に v1 で
--   アカウントを作ろうとすると次のエラーで拒否される:
--     "Stripe no longer recommends Accounts v1 for new Connect integrations.
--      Create connected accounts with POST /v2/core/accounts instead"
--   そこで v2（/v2/core/accounts）に切り替える。v2 には上記の真偽値が存在せず、
--   代わりに「ケイパビリティごとのステータス」と「requirements の一覧」を持つ。
--
-- 対応付け（実APIのレスポンスを確認して決定）:
--   charges_enabled   → transfers_enabled に改名
--       v2: configuration.recipient.capabilities.stripe_balance.stripe_transfers.status === "active"
--       このモデルでは出品者は「送金を受け取る側」であって決済を受け付ける側ではない
--       （destination charge・on_behalf_of なし＝決済上の売主は TETOMI のまま）。
--       よって意味は「カード決済を受けられるか」ではなく「送金を受け取れるか」。
--       名前を実態に合わせないと、S4 の課金ゲートで誤読しかねないので改名する。
--   payouts_enabled   → そのまま
--       v2: ...capabilities.stripe_balance.payouts.status === "active"
--   details_submitted → 削除
--       v2 に相当概念が無い。「ユーザーの入力待ちがあるか」は requirements から導ける。
--   requirements_due  → そのまま（v2 の requirements.entries のうち、
--                       awaiting_action_from = "user" のものの description を入れる）
--   disabled_reason   → そのまま（v2 の capability status_details の code を入れる）
--
-- 適用順序: ... → migration-13 → この #14。
-- ※ Supabase SQL Editor は全体を1トランザクションで実行するため、途中エラーで全ロールバック。
-- ※ 冪等（複数回流しても同じ結果）。
-- ===================================================================

-- 1) charges_enabled → transfers_enabled ---------------------------------------------
--    まだ本番運用前で connect_accounts に実データが無い前提の改名。
do $mig$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'connect_accounts'
      and column_name = 'charges_enabled'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'connect_accounts'
      and column_name = 'transfers_enabled'
  ) then
    alter table public.connect_accounts rename column charges_enabled to transfers_enabled;
  end if;
end
$mig$;

-- 改名前の状態から流した場合に備えて、無ければ作る。
alter table public.connect_accounts
  add column if not exists transfers_enabled boolean not null default false;

-- 2) details_submitted は v2 に相当概念が無いので削除 ---------------------------------
alter table public.connect_accounts drop column if exists details_submitted;

comment on column public.connect_accounts.transfers_enabled is
  '送金を受け取れるか。v2 の configuration.recipient.capabilities.stripe_balance.stripe_transfers.status === active。'
  ' 受け渡し課金（destination charge）の可否ゲートはこの列で判定する。';
comment on column public.connect_accounts.payouts_enabled is
  '銀行口座への入金を受けられるか。v2 の ...capabilities.stripe_balance.payouts.status === active。';
comment on column public.connect_accounts.requirements_due is
  'Stripe が出品者本人の入力を待っている項目（v2 requirements.entries のうち awaiting_action_from=user の description）。空なら入力待ちなし。';
comment on column public.connect_accounts.disabled_reason is
  '送金ケイパビリティが有効でない理由（v2 の capability status_details の code）。';

-- 3) 列単位 grant を貼り直す ----------------------------------------------------------
--    列名が変わった／減ったので、migration-13 の grant を現在の列に合わせて再定義する。
--    stripe_account_id は引き続き authenticated に見せない（ブラウザに acct_ を渡さない）。
revoke all on public.connect_accounts from anon, authenticated;
grant select (user_id, transfers_enabled, payouts_enabled,
              requirements_due, disabled_reason, created_at, updated_at)
  on public.connect_accounts to authenticated;
