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
 * 予約の書き込みはサーバー（/api/reservations）経由で行う。
 *
 * 以前はここから Supabase を直接叩き、そのあとに別のリクエストで通知を頼んでいた。
 * その形だと「書き込めたのにメールだけ飛ばない」隙間ができるため、
 * **書き込みとメール送信を1回のリクエストにまとめた**。
 *
 * 安全性は変わっていない。サーバー側も anon キー＋本人の Cookie で書き込むので、
 * RLS も列レベル権限も、ステータス遷移のトリガーも同じに効く。
 */
async function callReservationApi(
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<{ data: { id?: string | null } | null; error: string | null }> {
  try {
    const res = await fetch("/api/reservations", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as
      | { id?: string | null; ok?: boolean; error?: string }
      | null;
    if (!res.ok) {
      return { data: null, error: json?.error ?? "通信に失敗しました" };
    }
    return { data: json ?? {}, error: null };
  } catch {
    return { data: null, error: "通信エラーが発生しました" };
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
  const { error } = await callReservationApi("PATCH", { id, status });
  if (error) console.error("updateReservationStatus failed:", error);
  return { error };
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
  const { error } = await callReservationApi("PATCH", { id, selectedSlot: index });
  if (error) console.error("selectCandidateSlot failed:", error);
  return { error };
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
  const { error } = await callReservationApi("PATCH", {
    id,
    proposed: {
      date: input.proposedDate,
      time: input.proposedTime,
      location: input.proposedLocation,
    },
  });
  if (error) console.error("proposeReschedule failed:", error);
  return { error };
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

/**
 * 購入希望を作成する。
 * buyerId は互換のために受け取るだけで、実際にはサーバーがログイン中の本人を使う
 * （クライアントの申告で他人名義の購入希望を作られないようにするため）。
 */
export async function createReservation(
  input: CreateReservationInput,
  buyerId: string,
): Promise<{ error: string | null }> {
  void buyerId;
  const { error } = await callReservationApi("POST", {
    listingId: input.listingId,
    sellerId: input.sellerId,
    price: input.price,
    slots: input.slots,
    preferredLocation: input.preferredLocation,
    message: input.message ?? "",
  });
  if (error) console.error("createReservation failed:", error);
  return { error };
}
