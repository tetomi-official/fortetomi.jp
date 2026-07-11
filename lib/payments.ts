import { createClient } from "@/lib/supabase/client";

// 決済（PB-036）クライアント側ヘルパー。
// payment_customers は RLS で本人の行のみ SELECT 可能。書き込みは API（service_role）経由。

/** ログイン中ユーザーが支払いカードを登録済みかを返す。 */
export async function hasRegisteredCard(): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payment_customers")
    .select("user_id")
    .maybeSingle();
  if (error) {
    console.error("hasRegisteredCard failed:", error.message);
    return false;
  }
  return !!data;
}

/** 受け渡しQR用のワンタイム nonce をサーバーから取得する（買い手）。 */
export async function requestPaymentNonce(
  reservationId: string,
): Promise<{ nonce: string | null; error: string | null; needsCard?: boolean }> {
  try {
    const res = await fetch("/api/payments/nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId }),
    });
    const data = (await res.json().catch(() => null)) as {
      nonce?: string;
      error?: string;
      needsCard?: boolean;
    } | null;
    if (!res.ok || !data?.nonce) {
      return { nonce: null, error: data?.error ?? "QRの発行に失敗しました", needsCard: data?.needsCard };
    }
    return { nonce: data.nonce, error: null };
  } catch {
    return { nonce: null, error: "通信エラーが発生しました" };
  }
}

/** QRに載せる文字列（reservationId と nonce を連結）。 */
export function encodePaymentQR(reservationId: string, nonce: string): string {
  return `tetomi:pay:${reservationId}:${nonce}`;
}

/** スキャンした文字列を解析。形式不正なら null。 */
export function decodePaymentQR(
  text: string,
): { reservationId: string; nonce: string } | null {
  const m = /^tetomi:pay:([0-9a-f-]{36}):([0-9a-f]{64})$/i.exec(text.trim());
  if (!m) return null;
  return { reservationId: m[1], nonce: m[2] };
}
