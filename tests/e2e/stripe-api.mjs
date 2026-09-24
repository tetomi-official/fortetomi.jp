// Stripe の実データを直接確かめるための入口（テスト専用）。
import Stripe from "stripe";

let cached = null;
export function stripeClient() {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY がありません");
  if (!key.startsWith("sk_test_")) throw new Error("テストキー（sk_test_）ではありません。実課金の危険があるため中止します");
  cached = new Stripe(key);
  return cached;
}
