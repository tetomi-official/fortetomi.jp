// ===================================================
// 決済会社の選択（PAY.jp / Stripe）
// ---------------------------------------------------
// 単一の環境変数 NEXT_PUBLIC_PAYMENT_PROVIDER で、サーバーとクライアントの
// 両方が同じ決済会社を見るようにする。ここを分けて server 用と client 用の
// 2変数にすると「画面は Stripe のカード欄なのにサーバーは PAY.jp に課金する」
// という食い違いが起こりうるため、意図的に1本にしている。
//
// 既定は payjp。未設定のデプロイは今までどおり PAY.jp で動く。
// ※ NEXT_PUBLIC_* はビルド時にインライン化されるため、切り替えには再デプロイが要る
//   （lib/prerelease.ts の NEXT_PUBLIC_RELEASE_PHASE と同じ運用）。
// ===================================================

export type ProviderName = "payjp" | "stripe";

export const PAYMENT_PROVIDER: ProviderName =
  process.env.NEXT_PUBLIC_PAYMENT_PROVIDER === "stripe" ? "stripe" : "payjp";
