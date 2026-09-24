import { createClient } from "@/lib/supabase/client";
import type { Message } from "./types";

// ===================================================
// 取引メッセージ データアクセス層（PB-041）。
// 1 予約（reservation）= 1 スレッド。閲覧・送信はその予約の当事者本人のみ
// （RLS / supabase/schemas/04_policies/050_messages.sql）。
//
// 送信だけはサーバー（POST /api/messages）を通す（#59）。相手に届いたことを
// メールで知らせるため、書き込みとメール送信を1回のリクエストにまとめてある。
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

/**
 * メッセージを送信する（サーバー経由）。
 *
 * 送信者はサーバーがログイン中の本人から決める（他人の名前では送れない）。
 * 送信に成功すると、相手に新着メールが送られる（送りすぎない決まりは
 * lib/notify-message.ts を見ること）。
 */
export async function sendMessage(
  reservationId: string,
  body: string,
): Promise<{ error: string | null; message: Message | null }> {
  const trimmed = body.trim();
  if (!trimmed) return { error: "メッセージが空です", message: null };
  try {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId, body: trimmed }),
    });
    const json = (await res.json().catch(() => null)) as
      | { message?: MessageRow; error?: string }
      | null;
    if (!res.ok || !json?.message) {
      const error = json?.error ?? "メッセージを送れませんでした";
      console.error("sendMessage failed:", error);
      return { error, message: null };
    }
    return { error: null, message: rowToMessage(json.message) };
  } catch {
    return { error: "通信エラーが発生しました", message: null };
  }
}

/**
 * このスレッドをどこまで読んだかを記録する（#59）。
 *
 * 使い道は「新着メールを送りすぎない」ことだけ。未読が残っているあいだは
 * 次のメッセージでメールを送らないので、開いたら必ず付け直す。
 * 書けるのは自分の分だけ（RLS）。失敗しても画面は止めない。
 */
export async function markThreadRead(reservationId: string, userId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("message_reads")
    .upsert(
      { reservation_id: reservationId, user_id: userId, last_read_at: new Date().toISOString() },
      { onConflict: "reservation_id,user_id" },
    );
  if (error) console.error("markThreadRead failed:", error.message);
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
