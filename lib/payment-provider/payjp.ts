// ===================================================
// PAY.jp 実装
// ---------------------------------------------------
// もともと app/api/payments/{register-card,charge}/route.ts に直接書かれていた
// PAY.jp 呼び出しを、そのままここへ移したもの。挙動は変えていない。
//
//  - カード番号は payjp.js（クライアント）がトークン化するので、ここには token だけ来る。
//  - 3DS: クライアントで認証済みのトークンだけを受け付ける。サーバーでも token の
//    three_d_secure_status を取り直して再検証する（クライアント検証は迂回されうるため）。
//    PAYJP_3DS_REQUIRED=false で明示的に無効化できる（開発用）。
//  - 課金は保存済み Customer の既定カードに対して行う（買い手不在でも課金できる設計）。
// ===================================================

import type {
  CardSetupSession,
  ChargeInput,
  ChargeOutcome,
  PaymentProvider,
  ProviderResult,
  RegisterCardPayload,
  RegisteredCardIds,
  StoredCustomer,
} from "./types";

const PAYJP_BASE = "https://api.pay.jp/v1";

function basicAuth(secret: string): string {
  return `Basic ${Buffer.from(`${secret}:`).toString("base64")}`;
}

function form(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

type PayjpError = { error?: { message?: string } };

/**
 * PAY.jp のトークンを取得し 3DS 認証済みかを検証する。
 * verified / attempted を成功とみなす（PAY.jp 指針に準拠）。
 */
async function verifyToken3ds(
  token: string,
  auth: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (process.env.PAYJP_3DS_REQUIRED === "false") return { ok: true };
  try {
    const res = await fetch(`${PAYJP_BASE}/tokens/${encodeURIComponent(token)}`, {
      headers: { Authorization: auth },
    });
    const data = (await res.json().catch(() => null)) as
      | (PayjpError & { card?: { three_d_secure_status?: string } })
      | null;
    if (!res.ok || !data) {
      return { ok: false, error: data?.error?.message ?? "カードの確認に失敗しました", status: 402 };
    }
    const status = data.card?.three_d_secure_status;
    if (status !== "verified" && status !== "attempted") {
      return {
        ok: false,
        error: "3Dセキュア認証が完了していません。カード登録をやり直してください。",
        status: 402,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "カードの確認に失敗しました", status: 502 };
  }
}

export function createPayjpProvider(secretKey: string): PaymentProvider {
  const auth = basicAuth(secretKey);

  return {
    name: "payjp",
    // PAY.jp の最小課金額は 50円。
    minimumAmountJpy: 50,
    // Payouts型のテナント登録は別途あるが、カード登録フォームの前提としては不要。
    requiresSellerOnboarding: false,

    async createCardSetupSession(): Promise<ProviderResult<CardSetupSession>> {
      // payjp.js は公開鍵だけで動くので、サーバー側の下準備は要らない。
      return { ok: true, value: { kind: "none" } };
    },

    async registerCard({
      userId,
      existing,
      payload,
    }: {
      userId: string;
      userEmail: string | null;
      existing: StoredCustomer | null;
      payload: RegisterCardPayload;
    }): Promise<ProviderResult<RegisteredCardIds>> {
      if (payload.provider !== "payjp") {
        return { ok: false, status: 400, error: "決済方式が一致しません" };
      }
      const token = payload.token;

      // 3DS 検証：認証済みトークンでなければカード登録を拒否する。
      const tds = await verifyToken3ds(token, auth);
      if (!tds.ok) {
        return { ok: false, status: tds.status, error: tds.error };
      }

      try {
        const cus = existing?.payjpCustomerId;
        if (cus) {
          // 既存 Customer にカードを追加し、既定カードに設定する。
          const cardRes = await fetch(`${PAYJP_BASE}/customers/${cus}/cards`, {
            method: "POST",
            headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
            body: form({ card: token }),
          });
          const card = (await cardRes.json().catch(() => null)) as
            | (PayjpError & { id?: string })
            | null;
          if (!cardRes.ok || !card?.id) {
            return {
              ok: false,
              status: 402,
              error: card?.error?.message ?? "カードの登録に失敗しました",
            };
          }
          await fetch(`${PAYJP_BASE}/customers/${cus}`, {
            method: "POST",
            headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
            body: form({ default_card: card.id }),
          });
          return { ok: true, value: { payjpCustomerId: cus } };
        }

        // 新規 Customer 作成（token を既定カードとして登録）。
        const cusRes = await fetch(`${PAYJP_BASE}/customers`, {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
          body: form({ card: token, description: `user:${userId}` }),
        });
        const created = (await cusRes.json().catch(() => null)) as
          | (PayjpError & { id?: string })
          | null;
        if (!cusRes.ok || !created?.id) {
          return {
            ok: false,
            status: 402,
            error: created?.error?.message ?? "カードの登録に失敗しました",
          };
        }
        return { ok: true, value: { payjpCustomerId: created.id } };
      } catch {
        return { ok: false, status: 502, error: "通信エラーが発生しました" };
      }
    },

    hasUsableCard(customer: StoredCustomer | null): boolean {
      return !!customer?.payjpCustomerId;
    },

    async charge(input: ChargeInput): Promise<ChargeOutcome> {
      const cus = input.customer.payjpCustomerId;
      if (!cus) {
        return { kind: "error", message: "買い手のカードが登録されていません", httpStatus: 409 };
      }
      try {
        const res = await fetch(`${PAYJP_BASE}/charges`, {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
          body: form({
            amount: String(input.amountJpy),
            currency: "jpy",
            customer: cus,
            description: input.description,
          }),
        });
        const charge = (await res.json().catch(() => null)) as
          | (PayjpError & { id?: string; paid?: boolean })
          | null;
        if (!res.ok || !charge?.id) {
          return {
            kind: "declined",
            code: "",
            message: charge?.error?.message ?? "決済に失敗しました",
          };
        }
        return { kind: "succeeded", chargeId: charge.id, paymentIntentId: null };
      } catch {
        return { kind: "error", message: "決済の通信に失敗しました", httpStatus: 502 };
      }
    },
  };
}
