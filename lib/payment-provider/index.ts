// ===================================================
// 決済会社の取り出し口（サーバー専用）
// ---------------------------------------------------
// APIルートは必ずここ経由で決済会社を得る。設定不備は例外ではなく
// providerConfigError() で先に検出し、ルートが 500 とメッセージを返す。
// ===================================================

import { PAYMENT_PROVIDER } from "./config";
import { createPayjpProvider } from "./payjp";
import type { PaymentProvider } from "./types";

/**
 * 秘密鍵などの設定漏れがあればメッセージを返す。問題なければ null。
 * ルートの先頭で呼び、null でなければ 500 で返すこと。
 */
export function providerConfigError(): string | null {
  if (PAYMENT_PROVIDER === "stripe") {
    // Stripe 実装はまだ入っていない。ここで止めないと、stripe を指定したのに
    // PAY.jp に課金が飛ぶという最悪の取り違えが起きる。
    return "決済の設定が未完了です（Stripe 実装は未提供）";
  }
  if (!process.env.PAYJP_SECRET_KEY) {
    return "決済の設定が未完了です（PAYJP_SECRET_KEY 未設定）";
  }
  return null;
}

/** 現在の決済会社の実装を返す。providerConfigError() が null であることが前提。 */
export function getProvider(): PaymentProvider {
  return createPayjpProvider(process.env.PAYJP_SECRET_KEY ?? "");
}

export { PAYMENT_PROVIDER } from "./config";
export type { ProviderName } from "./config";
