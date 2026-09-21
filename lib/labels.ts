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
