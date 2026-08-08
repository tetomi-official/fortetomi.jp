// ===================================================
// payment_customers の読み書き（service_role）
// ---------------------------------------------------
// この表への書き込みは service_role 専用。ユーザーが payjp_customer_id や
// stripe_customer_id を書けると「他人の cus_ を指す→他人のカードに課金」が
// 成立してしまうため（docs/supabase-migration-9-payments.sql 参照）。
//
// 決済会社ごとの列の違いをここ1か所に閉じ込める。Stripe の列を足すときも
// 触るのはこのファイルだけで済む。
// ===================================================

import { createAdminClient } from "@/lib/supabase/admin";
import type { RegisteredCardIds, StoredCustomer } from "./types";

/** 買い手の保存済みカード情報を読む。未登録なら null。 */
export async function loadStoredCustomer(userId: string): Promise<StoredCustomer | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("payment_customers")
    .select("user_id, payjp_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    userId: data.user_id,
    payjpCustomerId: data.payjp_customer_id ?? null,
    // Stripe 用の列はマイグレーション13で追加する。それまでは常に null。
    stripeCustomerId: null,
    stripePaymentMethodId: null,
  };
}

/** カード登録の結果を保存する。同じユーザーの行は上書き（1ユーザー1行）。 */
export async function saveRegisteredCard(
  userId: string,
  ids: RegisteredCardIds,
): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const row: Record<string, unknown> = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  if (ids.payjpCustomerId) row.payjp_customer_id = ids.payjpCustomerId;

  const { error } = await admin.from("payment_customers").upsert(row);
  return { error: error?.message ?? null };
}
