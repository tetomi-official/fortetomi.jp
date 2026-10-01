import type { Database } from "@/lib/database.types";

/** 運営の取引一覧が読む行（supabase/schemas/05_views/010_admin_reservations.sql）。 */
export type AdminReservationRow = Database["public"]["Views"]["admin_reservations"]["Row"];

/** 絞り込みに出す取引の状態。DB の CHECK 制約と同じ並び。 */
export const RESERVATION_STATUSES = [
  "申請中",
  "日程調整中",
  "承認済み",
  "完了",
  "キャンセル",
] as const;

export type ReservationStatusFilter = (typeof RESERVATION_STATUSES)[number];

/** URL から来た ?status= が、知っている状態かどうか。 */
export function isReservationStatus(v: string | undefined): v is ReservationStatusFilter {
  return !!v && (RESERVATION_STATUSES as readonly string[]).includes(v);
}
