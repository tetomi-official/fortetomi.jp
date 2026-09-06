// ===================================================
// Stripe Connect（出品者の口座登録）
// ---------------------------------------------------
// 課金・カード登録（PaymentProvider インターフェース）とは別の関心事なので、
// あのインターフェースには載せない。PAY.jp には意味を持たない概念で、載せると
// 中身のない空実装を強いるだけになる。Stripe専用のルートから直接このモジュールを使う。
//
// Express アカウントを使う（Custom ではなく）。日本の個人アカウントに必要な
// カナ/漢字の氏名・住所、生年月日、国内発行の身分証、銀行口座名義の一致確認は
// すべて Stripe がホストするオンボーディング画面が集める。自前で集めて
// 保持する理由がない。出品者に入金ダッシュボードが付いてくる利点もある。
// ===================================================

import type Stripe from "stripe";
import { getStripeClient } from "./stripe-client";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConnectState = "未作成" | "手続き中" | "審査中" | "利用可能" | "要対応";

export interface ConnectAccountStatus {
  state: ConnectState;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  disabledReason: string | null;
}

function siteUrl(): string {
  // 他ルート（reverify/recover）と同じ規約：本番は環境変数を正、無ければ localhost。
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function computeState(a: {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
}): ConnectState {
  if (a.chargesEnabled && a.payoutsEnabled) return "利用可能";
  if (!a.detailsSubmitted) return "手続き中";
  if (a.requirementsDue.length > 0) return "要対応";
  return "審査中";
}

function statusFromAccount(account: Stripe.Account): {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  disabledReason: string | null;
} {
  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted ?? false,
    requirementsDue: account.requirements?.currently_due ?? [],
    disabledReason: account.requirements?.disabled_reason ?? null,
  };
}

async function upsertConnectAccount(
  userId: string,
  stripeAccountId: string,
  fields: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirementsDue: string[];
    disabledReason: string | null;
  },
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("connect_accounts").upsert({
    user_id: userId,
    stripe_account_id: stripeAccountId,
    charges_enabled: fields.chargesEnabled,
    payouts_enabled: fields.payoutsEnabled,
    details_submitted: fields.detailsSubmitted,
    requirements_due: fields.requirementsDue,
    disabled_reason: fields.disabledReason,
    updated_at: new Date().toISOString(),
  });
}

/** connect_accounts の既存行を読む（service_role専用。stripe_account_id を含む）。 */
export async function loadConnectAccountRow(
  userId: string,
): Promise<{ stripeAccountId: string; detailsSubmitted: boolean } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("connect_accounts")
    .select("stripe_account_id, details_submitted")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return { stripeAccountId: data.stripe_account_id, detailsSubmitted: data.details_submitted };
}

/**
 * Express アカウントを作る（既にあれば作らない＝二重作成防止）。
 * 冪等キーはユーザーIDから導出するので、同時に二度呼ばれても Stripe 側では
 * 1つしか作られない（DB側の既存チェックと合わせた二重の防御）。
 */
export async function ensureConnectAccount(
  secretKey: string,
  userId: string,
  email: string | null,
): Promise<string> {
  const existing = await loadConnectAccountRow(userId);
  if (existing) return existing.stripeAccountId;

  const stripe = getStripeClient(secretKey);
  const account = await stripe.accounts.create(
    {
      type: "express",
      country: "JP",
      email: email ?? undefined,
      business_type: "individual",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { user_id: userId },
    },
    { idempotencyKey: `connect:account:${userId}` },
  );

  await upsertConnectAccount(userId, account.id, statusFromAccount(account));
  return account.id;
}

/**
 * オンボーディング（または再開）用のリンクを発行する。
 * AccountLink は1回きりで数分で失効するため、毎回新規発行する。
 */
export async function createOnboardingLink(
  secretKey: string,
  accountId: string,
  linkType: "account_onboarding" | "account_update",
): Promise<string> {
  const stripe = getStripeClient(secretKey);
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: linkType,
    refresh_url: `${siteUrl()}/sell/connect/refresh`,
    return_url: `${siteUrl()}/sell/connect/return`,
    collection_options: { fields: "currently_due" },
  });
  return link.url;
}

/** Stripe から最新状態を取り直し、DBに反映してから返す。未登録なら null。 */
export async function refreshConnectAccountStatus(
  secretKey: string,
  userId: string,
): Promise<ConnectAccountStatus | null> {
  const existing = await loadConnectAccountRow(userId);
  if (!existing) return null;

  const stripe = getStripeClient(secretKey);
  const account = await stripe.accounts.retrieve(existing.stripeAccountId);
  const fields = statusFromAccount(account);
  await upsertConnectAccount(userId, existing.stripeAccountId, fields);

  return { state: computeState(fields), ...fields };
}
