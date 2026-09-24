import type { Condition, ListingStatus } from "./types";

export function conditionLabel(cond: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    "新品・未使用": { label: "新品", cls: "condition-new" },
    "書き込みなし": { label: "書き込みなし", cls: "condition-good" },
    "書き込み少し": { label: "書き込み少し", cls: "condition-few" },
    "汚れ・ダメージあり": { label: "汚れあり", cls: "condition-worn" },
  };
  return map[cond] ?? { label: cond, cls: "condition-good" };
}

export function statusLabel(s: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    "出品中": { label: "出品中", cls: "status-active" },
    "予約済み": { label: "予約済み", cls: "status-reserved" },
    "完了": { label: "取引完了", cls: "status-done" },
  };
  return map[s] ?? { label: s, cls: "status-active" };
}

export function reservationBadgeClass(status: string): string {
  const map: Record<string, string> = {
    "申請中": "badge-pending",
    "日程調整中": "badge-reschedule",
    "承認済み": "badge-confirmed",
    "完了": "badge-done",
    "キャンセル": "badge-cancelled",
  };
  return map[status] ?? "badge-pending";
}

export const CONDITION_OPTIONS: Condition[] = [
  "新品・未使用",
  "書き込みなし",
  "書き込み少し",
  "汚れ・ダメージあり",
];

export const STATUS_LIST: ListingStatus[] = ["出品中", "予約済み", "完了"];

export function yen(n: number): string {
  return `¥${Number(n).toLocaleString()}`;
}

export function formatDate(ts?: number): string {
  if (!ts) return "";
  const d = new Date(Number(ts));
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * "YYYY-MM-DD" を "9/30（水）" の形にする（issue #54）。
 * Stripe から来る入金予定日を画面に出すために使う。曜日まで出すのは、
 * 「4営業日後」のような相対表現より、実際の曜日の方が待ち時間を掴みやすいため。
 * 形が違う文字列は触らずそのまま返す。
 */
export function formatYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  // 日付だけを見たいので、時差でずれない正午のUTCとして解釈する。
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return `${Number(m[2])}/${Number(m[3])}（${"日月火水木金土"[d.getUTCDay()]}）`;
}

/**
 * 受け渡し候補（日付＋時刻）を表示用に整形（機能④）。
 * 例: ("2026-06-30", "10:00") -> "6/30 10:00"。
 * ISO 形式でない旧データ（"午前中（9:00〜12:00）" 等）はそのまま連結する。
 */
export function formatSlot(date: string, time: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const d = m ? `${Number(m[2])}/${Number(m[3])}` : date;
  return [d, time].filter(Boolean).join(" ");
}

/**
 * カードのブランド名を表示用にそろえる（#53）。
 * 決済会社ごとに表記が違う（Stripe は "visa"、PAY.jp は "Visa"）ので、
 * 小文字にしてから引き当てる。知らないブランドはそのまま出す。
 */
export function cardBrandLabel(brand: string): string {
  const map: Record<string, string> = {
    visa: "VISA",
    mastercard: "Mastercard",
    "master card": "Mastercard",
    jcb: "JCB",
    amex: "American Express",
    "american express": "American Express",
    diners: "Diners Club",
    "diners club": "Diners Club",
    discover: "Discover",
    unionpay: "UnionPay",
  };
  const key = brand.trim().toLowerCase();
  return map[key] ?? (brand.trim() || "カード");
}

/** カードの有効期限。例: (12, 2030) -> "2030年12月"。不明なら空文字。 */
export function cardExpiryLabel(month: number, year: number): string {
  if (!month || !year) return "";
  return `${year}年${month}月`;
}

/** 有効期限が切れているか（その月の末日までは使える）。 */
export function isCardExpired(month: number, year: number, now: Date = new Date()): boolean {
  if (!month || !year) return false;
  const 期限 = year * 12 + month;
  const 今 = now.getFullYear() * 12 + (now.getMonth() + 1);
  return 期限 < 今;
}

/**
 * 取引の「決済がどうなっているか」を一言にする（#60 の管理画面用）。
 *
 * reservations の paid_at と payment_status を突き合わせる。
 * payment_status は「成立しなかったとき」だけ入る列なので、
 * 困りごとのある状態を先に見て、最後に「支払い済み / 未決済」に落とす。
 * tone は画面の色分け（ng=赤 / warn=黄 / ok=緑 / none=灰）に使う。
 */
export type PaymentTone = "ng" | "warn" | "ok" | "none";

export function paymentStateLabel(
  paidAt: string | null,
  paymentStatus: string | null,
): { label: string; tone: PaymentTone; alert: boolean } {
  switch (paymentStatus) {
    case "disputed":
      return { label: "チャージバック", tone: "ng", alert: true };
    case "failed":
      return { label: "決済失敗", tone: "ng", alert: true };
    case "requires_action":
      return { label: "本人認証待ち", tone: "warn", alert: true };
  }
  if (paidAt) return { label: "支払い済み", tone: "ok", alert: false };
  return { label: "未決済", tone: "none", alert: false };
}

/** 日時を「6/30 10:03」の形にする。無ければ空文字。 */
export function formatDateTime(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
