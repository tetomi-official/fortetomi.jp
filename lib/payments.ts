// 決済（PB-036）クライアント側ヘルパー。
// payment_customers への書き込みは API（service_role）経由。カード登録済みかの判定も
// 「どの決済会社のIDが入っていれば有効か」が環境変数で決まるため、サーバーに任せる。

/** ログイン中ユーザーが、今の決済会社で課金できるカードを登録済みかを返す。 */
export async function hasRegisteredCard(): Promise<boolean> {
  try {
    const res = await fetch("/api/payments/status");
    const data = (await res.json().catch(() => null)) as { cardReady?: boolean } | null;
    if (!res.ok || !data) return false;
    return data.cardReady === true;
  } catch {
    return false;
  }
}

/** 登録済みカードの見え方。カード番号そのものは受け取らない。 */
export type CardSummary = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

/**
 * マイページ「お支払い方法」の中身を読む（#53）。
 * card が null なら未登録。pendingHandovers は受け渡し待ちの取引の件数で、
 * 1件以上あるとカードを削除できない（削除すると受け渡しQRが出せなくなるため）。
 */
export async function fetchPaymentMethod(): Promise<{
  card: CardSummary | null;
  pendingHandovers: number;
  error: string | null;
}> {
  try {
    const res = await fetch("/api/payments/card");
    const data = (await res.json().catch(() => null)) as
      | { card?: CardSummary | null; pendingHandovers?: number; error?: string }
      | null;
    if (!res.ok || !data) {
      return {
        card: null,
        pendingHandovers: 0,
        error: data?.error ?? "カード情報を読み込めませんでした",
      };
    }
    return {
      card: data.card ?? null,
      pendingHandovers: data.pendingHandovers ?? 0,
      error: null,
    };
  } catch {
    return { card: null, pendingHandovers: 0, error: "通信エラーが発生しました" };
  }
}

/** 登録済みカードを削除する（#53）。受け渡し待ちの取引があるとサーバー側で断られる。 */
export async function deleteRegisteredCard(): Promise<{ error: string | null }> {
  try {
    const res = await fetch("/api/payments/card", { method: "DELETE" });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !data?.ok) {
      return { error: data?.error ?? "カードを削除できませんでした" };
    }
    return { error: null };
  } catch {
    return { error: "通信エラーが発生しました" };
  }
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
