// 「ログイン状態を保持する」の有効期限管理（PB-011）。
//
// なぜ独自 Cookie なのか:
//   @supabase/ssr はセッション Cookie の maxAge を常に既定値（400日）に強制する
//   （cookieOptions.maxAge を渡しても setCookieOptions で上書きされ無視される）。
//   そのため「チェックなし=24時間 / あり=30日」の期限は Supabase 側では制御できない。
//   代わりに独自の期限 Cookie（epoch ms）を持ち、proxy（middleware）とクライアント初期化で
//   「絶対期限を過ぎたらローカルサインアウト」して実効セッションを打ち切る。
//   ※ 期限の数え方は「ログイン時刻からの絶対期限」（アイドルではない）。

export const SESSION_EXP_COOKIE = "tetomi_session_exp";
export const SHORT_DURATION_MS = 24 * 60 * 60 * 1000; // 24時間
export const LONG_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30日

// exp Cookie（epoch ms 文字列）が失効しているか。
// 値が無い/不正な場合も「失効」扱い＝強制ログアウト（Cookie 削除による期限回避を防ぐ）。
export function isSessionExpired(expRaw: string | undefined | null): boolean {
  if (!expRaw) return true;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp)) return true;
  return Date.now() >= exp;
}

// --- 以下はブラウザ専用（document 前提） ---

function secureAttr(): string {
  return typeof location !== "undefined" && location.protocol === "https:"
    ? "; secure"
    : "";
}

// exp Cookie の現在値を読む。
export function readSessionExp(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(/(?:^|;\s*)tetomi_session_exp=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

// ログイン成功時に呼ぶ。remember=true→30日 / false→24時間 の絶対期限を設定する。
export function writeSessionExp(remember: boolean): void {
  if (typeof document === "undefined") return;
  const durationMs = remember ? LONG_DURATION_MS : SHORT_DURATION_MS;
  const exp = Date.now() + durationMs;
  const maxAgeSec = Math.floor(durationMs / 1000);
  document.cookie = `${SESSION_EXP_COOKIE}=${exp}; path=/; max-age=${maxAgeSec}; samesite=lax${secureAttr()}`;
}

// ログアウト時に呼ぶ。
export function clearSessionExp(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_EXP_COOKIE}=; path=/; max-age=0; samesite=lax${secureAttr()}`;
}
