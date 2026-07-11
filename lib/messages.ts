import { createClient } from "@/lib/supabase/client";
import type { Message } from "./types";

// ===================================================
// 取引メッセージ データアクセス層（PB-041）。
// 1 予約（reservation）= 1 スレッド。閲覧・送信はその予約の当事者本人のみ
// （RLS / docs/supabase-migration-9-messages.sql）。
// ===================================================

type MessageRow = {
  id: string;
  reservation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    reservation_id: row.reservation_id,
    sender_id: row.sender_id,
    body: row.body,
    created_at: new Date(row.created_at).getTime(),
  };
}

/** 指定スレッド（予約）のメッセージを古い順で取得。 */
export async function fetchMessages(reservationId: string): Promise<Message[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchMessages failed:", error.message);
    return [];
  }
  return (data as MessageRow[]).map(rowToMessage);
}

/** メッセージを送信。senderId は送信者（= ログインユーザー）の id。 */
export async function sendMessage(
  reservationId: string,
  senderId: string,
  body: string,
): Promise<{ error: string | null; message: Message | null }> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "メッセージが空です", message: null };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({ reservation_id: reservationId, sender_id: senderId, body: trimmed })
    .select("*")
    .single();
  if (error) {
    console.error("sendMessage failed:", error.message);
    return { error: error.message, message: null };
  }
  return { error: null, message: rowToMessage(data as MessageRow) };
}

/**
 * 指定スレッドの新着メッセージを購読する（リアルタイム）。
 * 返り値は購読解除用の関数。相手の送信が即座に反映される。
 */
export function subscribeMessages(
  reservationId: string,
  onInsert: (message: Message) => void,
): () => void {
  const supabase = createClient();
  const channel = supabase
    .channel(`messages:${reservationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `reservation_id=eq.${reservationId}`,
      },
      (payload) => onInsert(rowToMessage(payload.new as MessageRow)),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
