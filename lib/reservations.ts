import { createClient } from "@/lib/supabase/client";
import type { CandidateSlot, Reservation, ReservationStatus } from "./types";

// ===================================================
// 予約（購入希望）データアクセス層（PB-028/029/032/033）。
// listings.ts と同じく、書き込みは Supabase 認証ユーザー前提。
// RLS: buyer_id = auth.uid() の行のみ insert 可。閲覧は buyer/seller 本人のみ。
// 更新は status 列のみ（列レベル権限）で buyer/seller 本人に限る。
// ===================================================

// reservations + 教科書名(listings.title) と買い手/出品者名(profiles.name) を結合。
// profiles への FK は buyer_id / seller_id の 2 本あるため、列名で曖昧さを解消する。
const SELECT =
  "*, listings(title), buyer:profiles!buyer_id(name), seller:profiles!seller_id(name)";

type ReservationRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  price: number;
  preferred_date: string;
  preferred_time: string;
  preferred_location: string;
  proposed_date: string | null;
  proposed_time: string | null;
  proposed_location: string | null;
  candidate_slots: CandidateSlot[] | null;
  selected_slot: number | null;
  message: string | null;
  status: string;
  created_at: string;
  charge_id: string | null;
  paid_at: string | null;
  payment_status: string | null;
  listings: { title: string | null } | null;
  buyer: { name: string | null } | null;
  seller: { name: string | null } | null;
};

function rowToReservation(row: ReservationRow): Reservation {
  return {
    id: row.id,
    listing_id: row.listing_id,
    listing_title: row.listings?.title ?? "（削除された教科書）",
    buyer_id: row.buyer_id,
    buyer_name: row.buyer?.name ?? "購入希望者",
    seller_id: row.seller_id,
    seller_name: row.seller?.name ?? "出品者",
    price: row.price,
    preferred_date: row.preferred_date,
    preferred_time: row.preferred_time,
    preferred_location: row.preferred_location,
    proposed_date: row.proposed_date ?? undefined,
    proposed_time: row.proposed_time ?? undefined,
    proposed_location: row.proposed_location ?? undefined,
    candidate_slots: row.candidate_slots ?? undefined,
    selected_slot: row.selected_slot ?? undefined,
    message: row.message ?? undefined,
    status: row.status as ReservationStatus,
    created_at: new Date(row.created_at).getTime(),
    charge_id: row.charge_id ?? undefined,
    paid_at: row.paid_at ? new Date(row.paid_at).getTime() : undefined,
    payment_status: (row.payment_status as Reservation["payment_status"]) ?? undefined,
  };
}

/**
 * 取引の通知メールをサーバーへ依頼する（PB-031 / A-1）。
 *
 * 予約の書き込みはブラウザから直接 Supabase へ行う設計なので、書き込みが
 * 成功したあとにここから知らせる。画面ごとに書くと呼び忘れるため、
 * 書き込みと同じ場所（このデータ層）にまとめている。
 *
 * 送れなくても操作そのものは成功しているので、失敗は握りつぶしてログだけ残す。
 * サーバー側が予約を読み直して当事者と状態を確かめるので、ここから嘘の通知は出せない。
 */
async function notifyReservation(
  reservationId: string,
  event: "created" | "approved" | "rescheduled" | "cancelled",
): Promise<void> {
  try {
    await fetch("/api/notifications/reservation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId, event }),
    });
  } catch (e) {
    console.error("notifyReservation failed:", e);
  }
}

/** 自分が送った購入希望（買い手視点）を新しい順で取得。 */
export async function fetchSentReservations(buyerId: string): Promise<Reservation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(SELECT)
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchSentReservations failed:", error.message);
    return [];
  }
  return (data as ReservationRow[]).map(rowToReservation);
}

/** 自分が受け取った購入希望（出品者視点）を新しい順で取得（PB-032）。 */
export async function fetchReceivedReservations(sellerId: string): Promise<Reservation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(SELECT)
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchReceivedReservations failed:", error.message);
    return [];
  }
  return (data as ReservationRow[]).map(rowToReservation);
}

/**
 * 購入希望のステータスを更新（PB-033：承認 / 断る / 取引完了）。
 * RLS と列レベル権限により、本人（buyer/seller）が status 列のみ更新可能。
 */
export async function updateReservationStatus(
  id: string,
  status: ReservationStatus,
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ status })
    .eq("id", id);
  if (error) {
    console.error("updateReservationStatus failed:", error.message);
    return { error: error.message };
  }
  // 相手に伝わるべきものだけ通知する（申請中・完了はここを通らない）。
  if (status === "承認済み") void notifyReservation(id, "approved");
  if (status === "キャンセル") void notifyReservation(id, "cancelled");
  return { error: null };
}

/**
 * 出品者が買い手の候補から1つ選んで確定する（機能④）。
 * selected_slot を書き込み、status を「承認済み」にする。
 * selected_slot の更新は DB トリガーで出品者本人のみに制限される。
 */
export async function selectCandidateSlot(
  id: string,
  index: number,
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({ selected_slot: index, status: "承認済み" })
    .eq("id", id);
  if (error) {
    console.error("selectCandidateSlot failed:", error.message);
    return { error: error.message };
  }
  void notifyReservation(id, "approved");
  return { error: null };
}

export type ProposeRescheduleInput = {
  proposedDate: string;
  proposedTime: string;
  proposedLocation: string;
};

/**
 * 出品者が別日程を逆提案する（PB-034 / 機能③）。
 * proposed_* を書き込み、status を「日程調整中」にして買い手の承諾を待つ。
 * proposed_* の更新は DB トリガーで出品者本人のみに制限される。
 */
export async function proposeReschedule(
  id: string,
  input: ProposeRescheduleInput,
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("reservations")
    .update({
      proposed_date: input.proposedDate,
      proposed_time: input.proposedTime,
      proposed_location: input.proposedLocation,
      status: "日程調整中",
    })
    .eq("id", id);
  if (error) {
    console.error("proposeReschedule failed:", error.message);
    return { error: error.message };
  }
  void notifyReservation(id, "rescheduled");
  return { error: null };
}

export type CreateReservationInput = {
  listingId: string;
  sellerId: string;
  price: number;
  /** 受け渡し候補（日付＋時刻）。1〜3件。先頭が第1希望。 */
  slots: CandidateSlot[];
  preferredLocation: string;
  message?: string;
};

/** 購入希望を作成。buyerId は送信者（= ログインユーザー）の id。 */
export async function createReservation(
  input: CreateReservationInput,
  buyerId: string,
): Promise<{ error: string | null }> {
  const supabase = createClient();
  // preferred_date/time は NOT NULL のため、第1希望（先頭候補）を投入して互換を保つ。
  const [first] = input.slots;
  const { data, error } = await supabase
    .from("reservations")
    .insert({
      listing_id: input.listingId,
      buyer_id: buyerId,
      seller_id: input.sellerId,
      price: input.price,
      preferred_date: first.date,
      preferred_time: first.time,
      preferred_location: input.preferredLocation,
      candidate_slots: input.slots,
      message: input.message?.trim() || null,
    })
    .select("id");
  if (error) {
    console.error("createReservation failed:", error.message);
    return { error: error.message };
  }
  const created = (data as { id: string }[] | null)?.[0];
  if (created) void notifyReservation(created.id, "created");
  return { error: null };
}
