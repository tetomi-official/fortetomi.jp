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

/**
 * 受け渡し日時（PB-051）。
 * 受け渡しはキャンパスの昼休みに固定し、買い手は「日付のみ」を次の1週間から選ぶ。
 * 時刻の自由入力は行わず、候補の time にはこのラベルを保存する。
 */
export const HANDOVER_TIME_LABEL = "昼休み";

export interface HandoverDateOption {
  /** YYYY-MM-DD（ローカル日付。candidate_slots.date に保存する値） */
  value: string;
  /** 表示用ラベル。例: "7/11（土）" */
  label: string;
}

const JP_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/**
 * 受け渡し候補に使う「今日から暦 days 日分」の日付選択肢を返す（PB-051）。
 * 土日を含む素直な暦日。UTC ずれを避けるためローカル日付から YYYY-MM-DD を組み立てる。
 */
export function upcomingHandoverDates(days = 7): HandoverDateOption[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const out: HandoverDateOption[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const value = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    out.push({ value, label: `${m}/${day}（${JP_WEEKDAYS[d.getDay()]}）` });
  }
  return out;
}

/**
 * サービス手数料率（PB-006）。教科書が売れた際に、出品者から教科書価格の10%をいただく。
 * 決済（PB-036）は買い手に満額を課金し、出品者の受取額はここから10%を差し引いた額になる。
 */
export const PLATFORM_FEE_RATE = 0.1;

/** 振込手数料（PB-046）。振込申請時に売上残高から差し引く。 */
export const PAYOUT_FEE_YEN = 250;

/** 販売価格から出品者の受取額（サービス手数料10%差引後）を計算する。端数は切り捨て。 */
export function sellerNet(price: number): number {
  return Math.floor(price * (1 - PLATFORM_FEE_RATE));
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
