// ===================================================
// 運営スタッフのアカウントの扱い（#60）
// ---------------------------------------------------
// 運営は学生ではない。教科書を買うことも出すこともなく、問い合わせが来たときに
// 取引の状況を確かめるだけ。そのため、ログインしても学生向けの画面は見せず、
// 取引一覧（/admin）と自分のマイページ（/mypage）だけを見せる。
//
// ※ アドレスの一覧は DB 側の
//    supabase/schemas/03_functions/005_is_operator_email.sql と同じ中身にしておく。
//    片方だけ変えると食い違う。役割が違うので両方に要る。
//      DB   … そのアドレスで登録できるか／運営フラグを立てるか
//      ここ … ログインしたあと、どの画面を見せるか
// ===================================================

export const OPERATOR_EMAILS = ["tetomitextbook@gmail.com"];

/** 運営のアドレスかどうか（大文字小文字・前後の空白は無視）。 */
export function isOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return OPERATOR_EMAILS.includes(email.trim().toLowerCase());
}

/** 運営がログインしたあとの行き先。 */
export const OPERATOR_HOME = "/admin";

// 運営が開ける場所。
//   /admin   取引一覧（本来の仕事）
//   /mypage  ログアウトとパスワードの変更のため
//   /login   ログインそのもの
//   /auth    メールの確認リンクの受け口
//   /api     画面ではないので巻き込まない（中身は RLS が守る）
const OPERATOR_ALLOWED = ["/admin", "/mypage", "/login", "/auth", "/api"];

/** 運営がそのページを開いてよいか。だめなら /admin に戻す。 */
export function operatorMayVisit(pathname: string): boolean {
  return OPERATOR_ALLOWED.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
