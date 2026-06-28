// 在籍担保のため、登録を許可する大学メールドメイン。
// ※サーバー側の最終防御は docs/supabase-setup.sql のトリガー。
//   ここを変えたら SQL 側の許可ドメインも合わせて更新すること。
export const ALLOWED_EMAIL_DOMAIN = "g.chuo-u.ac.jp";

/** 大学名（ドメインが中央大学固定のため定数化） */
export const UNIVERSITY_NAME = "中央大学";

/** 学部（プルダウン用。中央大学の学部） */
export const FACULTIES = [
  "法学部",
  "経済学部",
  "商学部",
  "理工学部",
  "文学部",
  "総合政策学部",
  "国際経営学部",
  "国際情報学部",
] as const;

/**
 * 受け渡し場所（PB-025）。学部ごとの受け渡し場所を自動表示する。
 * 現状は学部別マスタが未確定のため、全学部 Forest Gateway 3F に固定。
 * 学部別に分ける際は PICKUP_LOCATIONS に { 学部名: 場所 } を追加する。
 */
export const DEFAULT_PICKUP_LOCATION = "Forest Gateway 3F";
export const PICKUP_LOCATIONS: Record<string, string> = {
  // 例) "経済学部": "○○棟 1F", "理工学部": "△△ホール"
};

/** ユーザーの学部から受け渡し場所を解決（未定義の学部は既定値）。 */
export function pickupLocationForFaculty(faculty?: string | null): string {
  if (faculty && PICKUP_LOCATIONS[faculty]) return PICKUP_LOCATIONS[faculty];
  return DEFAULT_PICKUP_LOCATION;
}

/** 学年 */
export const GRADES = ["1年", "2年", "3年", "4年", "院生"] as const;

/** 性別 */
export const GENDERS = ["男性", "女性", "その他", "回答しない"] as const;

/** 大学メールが許可ドメインかどうか（大文字小文字・前後空白を無視） */
export function isAllowedEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

/** ざっくりしたメール形式チェック（個人メール用） */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
