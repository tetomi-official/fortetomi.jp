// ===================================================
// 決済会社の取り出し口（サーバー専用）
// ---------------------------------------------------
// APIルートは必ずここ経由で決済会社を得る。設定不備は例外ではなく
// providerConfigError() で先に検出し、ルートが 500 とメッセージを返す。
// ===================================================

import { PAYMENT_PROVIDER } from "./config";
import { createPayjpProvider } from "./payjp";
import { createStripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

/**
 * 秘密鍵などの設定漏れがあればメッセージを返す。問題なければ null。
 * ルートの先頭で呼び、null でなければ 500 で返すこと。
 */
export function providerConfigError(): string | null {
  if (PAYMENT_PROVIDER === "stripe") {
    if (!process.env.STRIPE_SECRET_KEY) {
      return "決済の設定が未完了です（STRIPE_SECRET_KEY 未設定）";
    }
    return null;
  }
  if (!process.env.PAYJP_SECRET_KEY) {
    return "決済の設定が未完了です（PAYJP_SECRET_KEY 未設定）";
  }
  return null;
}

/** 現在の決済会社の実装を返す。providerConfigError() が null であることが前提。 */
export function getProvider(): PaymentProvider {
  if (PAYMENT_PROVIDER === "stripe") {
    return createStripeProvider(process.env.STRIPE_SECRET_KEY ?? "");
  }
  return createPayjpProvider(process.env.PAYJP_SECRET_KEY ?? "");
}

export { PAYMENT_PROVIDER } from "./config";
export type { ProviderName } from "./config";
