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
