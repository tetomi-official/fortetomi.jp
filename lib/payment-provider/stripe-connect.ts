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
//
// なお fees_collector が効くのはダイレクト支払いだけで、destination charge では
// 設定に関係なく Stripe は必ずプラットフォームへ請求する。決済手数料も、送金の
// 0.25% も、入金の ¥250 + 0.25% も、有効アカウント月額 ¥200 も運営負担。
// 出品者に負担させるには決済方式そのものを変えることになる（＝決済上の売主が
// 出品者本人になり、特商法の表記も変わる）。docs/decisions/stripe-payout-behavior.md。
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

/**
 * Webhook から呼ぶ状態同期。Webhook が知っているのは acct_ だけなので、
 * そこから user_id を引いてキャッシュを更新する。
 * 該当行が無ければ何もしない（他プラットフォームのアカウント等）。
 */
export async function syncConnectAccountFromWebhook(
  secretKey: string,
  stripeAccountId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("connect_accounts")
    .select("user_id")
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();
  if (!data) return;

  const stripe = getStripeClient(secretKey);
  const account = (await stripe.v2.core.accounts.retrieve(stripeAccountId, {
    include: [...INCLUDE],
  })) as unknown as V2Account;

  await upsertConnectAccount(data.user_id, stripeAccountId, readStatus(account));
}

/**
 * 「今この瞬間、出品者は送金を受け取れるか」を Stripe に直接聞く。
 *
 * DBのキャッシュだけで判断すると、Stripe 側で口座が停止されたことに気づけず、
 * 買い手が待ち合わせ場所で「課金できないQR」を出すことになる。ここは頻度が低く
 * （買い手がQRを出すときだけ）、正しさが最優先の地点なので毎回問い合わせる。
 *
 * Stripe に届かないときはキャッシュ値にフォールバックする。決済会社の一時的な
 * 不調で、正常な取引まで止めてしまわないため。
 */
export async function isSellerReadyToReceive(
  secretKey: string,
  userId: string,
): Promise<{ ready: boolean; stripeAccountId: string | null }> {
  const existing = await loadConnectAccountRow(userId);
  if (!existing) return { ready: false, stripeAccountId: null };

  try {
    const stripe = getStripeClient(secretKey);
    const account = (await stripe.v2.core.accounts.retrieve(existing.stripeAccountId, {
      include: [...INCLUDE],
    })) as unknown as V2Account;
    const s = readStatus(account);
    await upsertConnectAccount(userId, existing.stripeAccountId, s);
    return { ready: s.transfersEnabled, stripeAccountId: existing.stripeAccountId };
  } catch (e) {
    console.error("connect status refresh failed (falling back to cache):", e);
    return { ready: existing.transfersEnabled, stripeAccountId: existing.stripeAccountId };
  }
}

// ===================================================
// 残高と入金予定（issue #54）
// ---------------------------------------------------
// TETOMI は売上金を預かっていない。決済が成立した時点で出品者の Stripe 残高へ移り、
// 銀行への入金も Stripe が自動で行う。だからマイページに出すのは自前の集計ではなく
// Stripe の実残高でなければならない（予約テーブルから足し算すると、返金・入金済みの
// ぶんがずれて「画面の数字と実際の残高が違う」状態になる）。
//
// 任意振込（出品者が自分で振込を操作する機能）はやらないと決めた。
// 振込1回につき 0.25% + ¥250 が運営に請求され、Stripe 側に最低金額が無いため、
// 回数を出品者に決めさせると運営のコストが読めなくなる。
// 経緯と実測は docs/decisions/stripe-payout-behavior.md。
// ===================================================

export interface ConnectBalance {
  /** 今すぐ入金に回せる額（円）。 */
  available: number;
  /** まだ入金に回せない額（円）。決済から4営業日は here に入る。 */
  pending: number;
  /** pending のうち一番早く使えるようになる日（YYYY-MM-DD・JST）。無ければ null。 */
  pendingAvailableOn: string | null;
  /** 進行中の入金の着金予定日（YYYY-MM-DD・JST）。無ければ null。 */
  nextPayoutDate: string | null;
  /** 進行中の入金の額（円）。無ければ null。 */
  nextPayoutAmount: number | null;
  /** 自動入金の間隔の説明（例「毎週金曜」）。取れなければ null。 */
  scheduleLabel: string | null;
}

const WEEKDAY_JA: Record<string, string> = {
  monday: "月",
  tuesday: "火",
  wednesday: "水",
  thursday: "木",
  friday: "金",
};

/** Unix秒を日本時間の YYYY-MM-DD にする。 */
function jstDate(unixSeconds: number): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(unixSeconds * 1000),
  );
}

/** 自動入金の間隔を日本語の一言にする。分からない形なら null（＝画面に出さない）。 */
function scheduleLabel(schedule: {
  interval?: string | null;
  weekly_payout_days?: string[];
  monthly_payout_days?: number[];
} | null): string | null {
  if (!schedule?.interval) return null;
  switch (schedule.interval) {
    case "daily":
      return "毎日";
    case "weekly": {
      const days = (schedule.weekly_payout_days ?? [])
        .map((d) => WEEKDAY_JA[d])
        .filter(Boolean);
      return days.length > 0 ? `毎週${days.join("・")}曜` : "毎週";
    }
    case "monthly": {
      const days = schedule.monthly_payout_days ?? [];
      return days.length > 0 ? `毎月${days.join("・")}日` : "毎月";
    }
    case "manual":
      // 自動入金が止まっている状態。出品者には「自動で入金される」と言えない。
      return null;
    default:
      return null;
  }
}

/**
 * 出品者の Stripe 残高と入金予定を取る。受取口座が未登録なら null。
 *
 * 通貨は円だけを見る（このサービスは日本の学生同士の売買で、他通貨の残高は発生しない）。
 */
export async function loadConnectBalance(
  secretKey: string,
  userId: string,
): Promise<ConnectBalance | null> {
  const existing = await loadConnectAccountRow(userId);
  if (!existing) return null;

  const stripe = getStripeClient(secretKey);
  const opts = { stripeAccount: existing.stripeAccountId };

  // 進行中の入金は pending（作成済み）と in_transit（銀行へ送信済み）の2状態がある。
  // 出品者にとってはどちらも「これから届く」なので、着金予定日が近い方を1件だけ出す。
  const [balance, settings, pendingPayouts, inTransitPayouts] = await Promise.all([
    stripe.balance.retrieve({}, opts),
    stripe.balanceSettings.retrieve({}, opts).catch(() => null),
    stripe.payouts.list({ limit: 1, status: "pending" }, opts),
    stripe.payouts.list({ limit: 1, status: "in_transit" }, opts),
  ]);

  const jpy = (rows: { amount: number; currency: string }[]) =>
    rows.filter((r) => r.currency === "jpy").reduce((s, r) => s + r.amount, 0);

  const pending = jpy(balance.pending);

  // 「いつ使えるようになるか」は残高オブジェクトには入っていないので、取引から拾う。
  // pending は4営業日以内に発生したものだけなので、直近100件で必ず足りる。
  let pendingAvailableOn: string | null = null;
  if (pending > 0) {
    const txns = await stripe.balanceTransactions.list({ limit: 100 }, opts);
    const dates = txns.data
      .filter((t) => t.status === "pending" && t.currency === "jpy")
      .map((t) => t.available_on);
    if (dates.length > 0) pendingAvailableOn = jstDate(Math.min(...dates));
  }

  const upcoming = [...pendingPayouts.data, ...inTransitPayouts.data].sort(
    (a, b) => a.arrival_date - b.arrival_date,
  )[0];

  return {
    available: jpy(balance.available),
    pending,
    pendingAvailableOn,
    nextPayoutDate: upcoming ? jstDate(upcoming.arrival_date) : null,
    nextPayoutAmount: upcoming ? upcoming.amount : null,
    scheduleLabel: scheduleLabel(settings?.payments?.payouts?.schedule ?? null),
  };
}
