// ===================================================
// 決済会社の選択（PAY.jp / Stripe）
// ---------------------------------------------------
// 単一の環境変数 NEXT_PUBLIC_PAYMENT_PROVIDER で、サーバーとクライアントの
// 両方が同じ決済会社を見るようにする。ここを分けて server 用と client 用の
// 2変数にすると「画面は Stripe のカード欄なのにサーバーは PAY.jp に課金する」
// という食い違いが起こりうるため、意図的に1本にしている。
//
// 既定は stripe。PAY.jp は使わない方針になったため（2026-09）、未設定のときは
// Stripe を選ぶ。逆にしておくと、本番で環境変数を入れ忘れたときに気づかないまま
// PAY.jp で動いてしまう。既定を「使う方」に置き、キーが無ければ 500 で止める方が安全。
//
// PAY.jp の実装は消していない。差し替え口は既に出来ていて維持費がかからず、
// Stripe 側で詰まったときの退路になるため。使うときは明示的に payjp を指定する。
//
// ※ NEXT_PUBLIC_* はビルド時にインライン化されるため、切り替えには再デプロイが要る
//   （lib/prerelease.ts の NEXT_PUBLIC_RELEASE_PHASE と同じ運用）。
// ===================================================

export type ProviderName = "payjp" | "stripe";

export const PAYMENT_PROVIDER: ProviderName =
  process.env.NEXT_PUBLIC_PAYMENT_PROVIDER === "payjp" ? "payjp" : "stripe";
