// ログインのあとに戻る先（?next=）の扱い。
//
// 戻り先は URL から来るので、そのまま使うと「ログイン後に外のサイトへ飛ばす」悪用ができる
// （例：/login?next=https://偽サイト）。このサイトの中のページだけを受け付ける。

// 改行などの制御文字（ASCII の 0〜31 と 127）
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

/** 戻り先として安全なら、そのパスを返す。怪しいもの・無いものは "/"。 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  // "/" で始まる、このサイトの中のパスだけ。
  // "//evil.com" や "/\evil.com" はブラウザが外のサイトとして扱うので弾く。
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (CONTROL_CHARS.test(raw)) return "/";
  // ログイン画面に戻るとログインが終わらないので、トップへ
  if (raw === "/login" || raw.startsWith("/login?") || raw.startsWith("/login/")) return "/";
  return raw;
}

/** 今いるページを戻り先にした、ログイン画面の URL。 */
export function loginHref(next: string | null | undefined): string {
  const path = safeNextPath(next);
  return path === "/" ? "/login" : `/login?next=${encodeURIComponent(path)}`;
}
