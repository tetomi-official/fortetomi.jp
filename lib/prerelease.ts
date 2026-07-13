// ===================================================
// プレリリース段階解禁（フェーズ制フィーチャーフラグ）
// ---------------------------------------------------
// 単一の環境変数 NEXT_PUBLIC_RELEASE_PHASE を「今どこまで公開してよいか」の
// しきい値として扱い、機能の出し分け判断をすべてここに集約する。
//
//   Phase 0: プレリリース（閲覧のみ）— トップ / 一覧・検索 / 詳細（ボタン無効）
//   Phase 1: 購入・予約解禁 — 購入希望ボタン / /checkout / /mypage / /api/payments
//   Phase 2: 出品解禁 — /sell
//   Phase 3+: 全解禁
//
// 解禁はコード変更なしで、Vercel の環境変数を 0→1→2 と上げるだけ。
// ※ NEXT_PUBLIC_* はビルド時にインライン化されるため、変更時は再デプロイが走る。
// ===================================================

export const RELEASE_PHASE = Number(process.env.NEXT_PUBLIC_RELEASE_PHASE ?? "0");

// 機能フラグ（クライアント UI で使用）
export const canReserve = RELEASE_PHASE >= 1; // 購入希望・予約・checkout・決済
export const canSell = RELEASE_PHASE >= 2; // 出品

// proxy でのサーバー強制用: フェーズ未満なら遮断するルート。
// ここに無いパス（/auth/confirm・/api/reverify・法務・認証ページ等）は常に許可。
const RESTRICTED: { prefix: string; minPhase: number; isApi?: boolean }[] = [
  { prefix: "/sell", minPhase: 2 },
  { prefix: "/mypage", minPhase: 1 },
  { prefix: "/checkout", minPhase: 1 },
  { prefix: "/api/payments", minPhase: 1, isApi: true },
];

/**
 * 現在のフェーズで遮断すべきルートなら { isApi } を返す（page はリダイレクト / api は 404）。
 * 対象外なら null。
 */
export function blockedRoute(pathname: string): { isApi: boolean } | null {
  for (const r of RESTRICTED) {
    if (pathname === r.prefix || pathname.startsWith(r.prefix + "/")) {
      if (RELEASE_PHASE < r.minPhase) return { isApi: !!r.isApi };
    }
  }
  return null;
}
