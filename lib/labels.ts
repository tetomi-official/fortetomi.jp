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
