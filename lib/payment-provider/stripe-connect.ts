// ===================================================
// Stripe Connect（出品者の受取口座）— Accounts v2
// ---------------------------------------------------
// 課金・カード登録（PaymentProvider インターフェース）とは別の関心事なので、
// あのインターフェースには載せない。PAY.jp には意味を持たない概念で、載せると
// 中身のない空実装を強いるだけになる。Stripe専用のルートから直接このモジュールを使う。
//
// Accounts v2（/v2/core/accounts）を使う。v1 は新規 Connect 連携では Stripe に
// 拒否される（"Stripe no longer recommends Accounts v1 for new Connect integrations"）。
//
// 構成は recipient のみ:
//   出品者は「送金を受け取る側」であって、決済を受け付ける側ではない。
//   destination charge を on_behalf_of なしで使う＝決済上の売主は TETOMI のままなので、
//   出品者に merchant 構成（card_payments）は要らない。recipient 構成の
//   stripe_balance.stripe_transfers が「送金を受け取れる」ケイパビリティ。
//
// 手数料と損失の負担者は application（＝TETOMI）。Express ダッシュボードを
// 使う場合、Stripe 側の制約でこの2つは application である必要がある。
// これは計画どおり（Stripeの決済手数料とチャージバックはプラットフォーム負担）。
// ===================================================

import { getStripeClient } from "./stripe-client";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConnectState = "未作成" | "手続き中" | "審査中" | "利用可能";

export interface ConnectAccountStatus {
  state: ConnectState;
  transfersEnabled: boolean;
  payoutsEnabled: boolean;
  /** 出品者本人の入力待ちになっている項目。 */
  requirementsDue: string[];
  disabledReason: string | null;
}

// v2 のレスポンスは include で指定した分だけ返る。必要な範囲だけ取る。
const INCLUDE = ["configuration.recipient", "requirements"] as const;

// 業種コード（MCC）5942 = 書店。中古教科書の売買に最も近い分類。
const MCC_BOOK_STORES = "5942";

function siteUrl(): string {
  // 他ルート（reverify/recover）と同じ規約：本番は環境変数を正、無ければ localhost。
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

type V2Account = {
  id: string;
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          payouts?: { status?: string; status_details?: { code?: string }[] };
          stripe_transfers?: { status?: string; status_details?: { code?: string }[] };
        };
      };
    };
  };
  requirements?: {
    entries?: { description?: string; awaiting_action_from?: string }[];
  };
};

function readStatus(account: V2Account): Omit<ConnectAccountStatus, "state"> {
  const balance = account.configuration?.recipient?.capabilities?.stripe_balance;
  const transfers = balance?.stripe_transfers;
  const payouts = balance?.payouts;

  // 出品者本人の入力待ちだけを拾う（Stripe 側の審査待ちは出品者には操作できない）。
  const requirementsDue = (account.requirements?.entries ?? [])
    .filter((e) => e.awaiting_action_from === "user")
    .map((e) => e.description)
    .filter((d): d is string => !!d);

  return {
    transfersEnabled: transfers?.status === "active",
    payoutsEnabled: payouts?.status === "active",
    requirementsDue,
    disabledReason: transfers?.status_details?.[0]?.code ?? null,
  };
}

function computeState(s: Omit<ConnectAccountStatus, "state">): ConnectState {
  // 送金を受け取れて、かつ銀行口座への入金もできる状態が「利用可能」。
  if (s.transfersEnabled && s.payoutsEnabled) return "利用可能";
  // 本人の入力待ちが残っているなら、出品者が続きをやれば進む。
  if (s.requirementsDue.length > 0) return "手続き中";
  // 入力は出し切っていて、Stripe 側の確認待ち。
  return "審査中";
}

async function upsertConnectAccount(
  userId: string,
  stripeAccountId: string,
  s: Omit<ConnectAccountStatus, "state">,
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("connect_accounts").upsert({
    user_id: userId,
    stripe_account_id: stripeAccountId,
    transfers_enabled: s.transfersEnabled,
    payouts_enabled: s.payoutsEnabled,
    requirements_due: s.requirementsDue,
    disabled_reason: s.disabledReason,
    updated_at: new Date().toISOString(),
  });
}

/** connect_accounts の既存行を読む（service_role専用。stripe_account_id を含む）。 */
export async function loadConnectAccountRow(
  userId: string,
): Promise<{ stripeAccountId: string; transfersEnabled: boolean } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("connect_accounts")
    .select("stripe_account_id, transfers_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return { stripeAccountId: data.stripe_account_id, transfersEnabled: data.transfers_enabled };
}

/**
 * 出品者の連結アカウントを作る（既にあれば作らない＝二重作成防止）。
 * 冪等キーはユーザーIDから導出するので、同時に二度呼ばれても Stripe 側では
 * 1つしか作られない（DB側の既存チェックと合わせた二重の防御）。
 */
export async function ensureConnectAccount(
  secretKey: string,
  userId: string,
  email: string | null,
  displayName: string | null,
): Promise<string> {
  const existing = await loadConnectAccountRow(userId);
  if (existing) return existing.stripeAccountId;

  const stripe = getStripeClient(secretKey);
  const account = (await stripe.v2.core.accounts.create(
    {
      contact_email: email ?? undefined,
      display_name: displayName ?? undefined,
      // 出品者に入金ダッシュボードを提供する。Express の場合、Stripe の制約で
      // fees_collector / losses_collector は application である必要がある。
      dashboard: "express",
      identity: { country: "jp", entity_type: "individual" },
      configuration: {
        // 業種・事業URL・商品説明は Stripe が必ず要求してくる。出品者に聞くと
        // 「あなたの事業URLは？」「何を販売していますか？」という、教科書を1冊
        // 売りたいだけの学生には答えようのない質問になる。答えは常に同じなので
        // プラットフォーム側で埋めておき、出品者には自分の身元と口座だけ入力させる。
        // （実測: 出品者の入力項目が 25 → 22 件に減る）
        //
        // ※ これにより merchant 構成が applied になるが capabilities は空のまま＝
        //   出品者に「決済を受け付ける」権限は付かない。設定を確認済み。
        merchant: { mcc: MCC_BOOK_STORES },
        recipient: {
          capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
        },
      },
      defaults: {
        currency: "jpy",
        locales: ["ja-JP"],
        responsibilities: { fees_collector: "application", losses_collector: "application" },
        profile: {
          business_url: siteUrl(),
          product_description: "大学の教科書の個人間売買（中古書籍）",
        },
      },
      metadata: { user_id: userId },
      include: [...INCLUDE],
    },
    { idempotencyKey: `connect:account:${userId}` },
    // SDK の型は v2 プレビュー相当で緩いため、レスポンスは自前の型で受ける。
  )) as unknown as V2Account;

  await upsertConnectAccount(userId, account.id, readStatus(account));
  return account.id;
}

/**
 * オンボーディング用のリンクを発行する。
 * 1回きりで数分で失効するため、毎回新規発行する。中断からの再開も同じ種類で足りる
 * （Stripe のホスト画面が残りの必要項目だけを出す）。
 */
export async function createOnboardingLink(
  secretKey: string,
  accountId: string,
): Promise<string> {
  const stripe = getStripeClient(secretKey);
  const link = (await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["recipient"],
        refresh_url: `${siteUrl()}/sell/connect/refresh`,
        return_url: `${siteUrl()}/sell/connect/return`,
      },
    },
  })) as unknown as { url: string };
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
  const account = (await stripe.v2.core.accounts.retrieve(existing.stripeAccountId, {
    include: [...INCLUDE],
  })) as unknown as V2Account;

  const s = readStatus(account);
  await upsertConnectAccount(userId, existing.stripeAccountId, s);
  return { state: computeState(s), ...s };
}
