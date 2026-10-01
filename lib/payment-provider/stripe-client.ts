// ===================================================
// Stripe SDK のシングルトン（サーバー専用）
// ---------------------------------------------------
// APIバージョンはあえて明示しない＝ SDK 同梱の既定値（stripe@22.6.1 では
// 2026-08-26.dahlia）に固定される。ダッシュボード側の既定バージョンが
// 後日変わっても、このコードの挙動が黙って変わらないようにするため。
// バージョンを上げたいときは SDK 自体を上げて意図的に確認する。
// ===================================================

import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripeClient(secretKey: string): Stripe {
  if (!client) {
    client = new Stripe(secretKey);
  }
  return client;
}
