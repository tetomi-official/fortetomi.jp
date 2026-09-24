// ===================================================
// payment_customers の読み書き（service_role）
// ---------------------------------------------------
// この表への書き込みは service_role 専用。ユーザーが payjp_customer_id や
// stripe_customer_id を書けると「他人の cus_ を指す→他人のカードに課金」が
// 成立してしまうため（supabase/schemas/04_policies/060_payment_customers.sql 参照）。
//
// 決済会社ごとの列の違いをここ1か所に閉じ込める。Stripe の列を足すときも
// 触るのはこのファイルだけで済む。
// ===================================================

import { createAdminClient } from "@/lib/supabase/admin";
import type { ProviderName, RegisteredCardIds, StoredCustomer } from "./types";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";

/** 買い手の保存済みカード情報を読む。未登録なら null。 */
export async function loadStoredCustomer(userId: string): Promise<StoredCustomer | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("payment_customers")
    .select("user_id, payjp_customer_id, stripe_customer_id, stripe_payment_method_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    userId: data.user_id,
    payjpCustomerId: data.payjp_customer_id ?? null,
    stripeCustomerId: data.stripe_customer_id ?? null,
    stripePaymentMethodId: data.stripe_payment_method_id ?? null,
  };
}

/** カード登録の結果を保存する。同じユーザーの行は上書き（1ユーザー1行）。 */
export async function saveRegisteredCard(
  userId: string,
  ids: RegisteredCardIds,
): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const row: TablesInsert<"payment_customers"> = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  if (ids.payjpCustomerId) {
    row.payjp_customer_id = ids.payjpCustomerId;
    row.provider = "payjp";
  }
  if (ids.stripeCustomerId) {
    row.stripe_customer_id = ids.stripeCustomerId;
    row.provider = "stripe";
  }
  if (ids.stripePaymentMethodId) row.stripe_payment_method_id = ids.stripePaymentMethodId;

  const { error } = await admin.from("payment_customers").upsert(row);
  return { error: error?.message ?? null };
}

/**
 * 保存済みカードのIDを消す（決済会社側で外したあとに呼ぶ）。
 *
 * 今の決済会社の列だけを空にする。もう一方の決済会社のIDが残っていれば行は残す
 * （決済会社を戻したときに、以前のカードがそのまま使えるように）。どちらも空に
 * なるなら行ごと消す。空のIDだけが残った行は「登録済みか」の判定を分かりにくくする。
 */
export async function clearRegisteredCard(
  userId: string,
  provider: ProviderName,
): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const current = await loadStoredCustomer(userId);
  if (!current) return { error: null };

  const otherProviderRemains =
    provider === "stripe" ? !!current.payjpCustomerId : !!current.stripeCustomerId;

  if (!otherProviderRemains) {
    const { error } = await admin.from("payment_customers").delete().eq("user_id", userId);
    return { error: error?.message ?? null };
  }

  const cleared: TablesUpdate<"payment_customers"> = {
    updated_at: new Date().toISOString(),
    ...(provider === "stripe"
      ? { stripe_customer_id: null, stripe_payment_method_id: null, provider: "payjp" }
      : { payjp_customer_id: null, provider: "stripe" }),
  };
  const { error } = await admin
    .from("payment_customers")
    .update(cleared)
    .eq("user_id", userId);
  return { error: error?.message ?? null };
}
