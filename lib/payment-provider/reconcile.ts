// ===================================================
// 「支払い済み」の記録（唯一の書き込み口）
// ---------------------------------------------------
// 課金APIと Webhook の両方から呼ばれる。同じ更新が2か所に散っていると
// 片方だけ直して食い違う事故が起きるため、1本にまとめている。
//
// 冪等性: paid_at が null の行だけを更新する。課金APIと Webhook が同時に
// 到達しても、実際に書き込むのは片方だけになる。
// ===================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveNotifyEmail, sendMail } from "@/lib/mail";
import {
  paymentCompletedBuyerMail,
  paymentCompletedSellerMail,
  type ReservationMailData,
} from "@/lib/mail-templates";
import type { ProviderName } from "./config";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MarkPaidResult = {
  /** 更新できた、または既に決済済みで何もする必要が無かった。 */
  ok: boolean;
  /** 既に決済済みだった（今回の呼び出しでは書き込んでいない）。 */
  alreadyPaid: boolean;
  error: string | null;
};

/**
 * 予約を決済済みにし、出品を「完了」にする。
 * 受け渡しQRのワンタイム nonce はここで消費（null 化）する。
 */
export async function markReservationPaid(args: {
  reservationId: string;
  chargeId: string;
  provider?: ProviderName;
  /** Stripe の PaymentIntent(pi_)。PAY.jp では null。charge_id には入れない。 */
  paymentIntentId?: string | null;
}): Promise<MarkPaidResult> {
  const admin = createAdminClient();

  const { data: updated, error } = await admin
    .from("reservations")
    .update({
      charge_id: args.chargeId,
      paid_at: new Date().toISOString(),
      status: "完了",
      payment_nonce_hash: null,
      payment_provider: args.provider ?? null,
      payment_intent_id: args.paymentIntentId ?? null,
      // 成立したので、途中で記録した失敗状態は消す。
      payment_status: null,
      payment_error_code: null,
    })
    .eq("id", args.reservationId)
    .is("paid_at", null) // 二重更新防止（同時到達しても片方だけ）
    .select("id, listing_id, buyer_id, seller_id, price");

  if (error) {
    return { ok: false, alreadyPaid: false, error: error.message };
  }
  if (!updated || updated.length === 0) {
    // 他方（課金API or Webhook）が先に記録済み。異常ではない。
    return { ok: true, alreadyPaid: true, error: null };
  }

  // 出品を「完了」にして一覧から実質的に落とす（売り切れ表示）。
  const listingId = updated[0].listing_id;
  if (listingId) {
    await admin.from("listings").update({ status: "完了" }).eq("id", listingId);
  }

  // 決済完了の通知（A-1）。ここは課金API・Webhook・3DS復旧のどの経路も必ず通り、
  // paid_at の見張りで1回しか来ないので、二重送信にならない。
  // ★メールの失敗で決済処理を壊さない。落ちても課金は成立している。
  try {
    await notifyPaymentCompleted(admin, updated[0]);
  } catch (e) {
    console.error("決済完了メールの送信に失敗（課金は成立済み）:", e);
  }

  return { ok: true, alreadyPaid: false, error: null };
}

/** 決済が成立したことを買い手と出品者の双方へ知らせる。 */
async function notifyPaymentCompleted(
  admin: SupabaseClient,
  row: { id: string; listing_id: string | null; buyer_id: string; seller_id: string; price: number },
): Promise<void> {
  const [{ data: listing }, { data: buyer }, { data: seller }] = await Promise.all([
    admin.from("listings").select("title").eq("id", row.listing_id ?? "").maybeSingle(),
    admin.from("profiles").select("name").eq("id", row.buyer_id).maybeSingle(),
    admin.from("profiles").select("name").eq("id", row.seller_id).maybeSingle(),
  ]);

  const data: ReservationMailData = {
    reservationId: row.id,
    listingTitle: listing?.title ?? "（削除された教科書）",
    price: row.price,
    buyerName: buyer?.name ?? "購入者",
    sellerName: seller?.name ?? "出品者",
    location: "",
  };

  const [買い手宛, 出品者宛] = await Promise.all([
    resolveNotifyEmail(admin, row.buyer_id),
    resolveNotifyEmail(admin, row.seller_id),
  ]);

  await Promise.all([
    買い手宛
      ? sendMail({ to: 買い手宛, ...paymentCompletedBuyerMail(data) })
      : Promise.resolve(console.error(`[notify] 買い手の宛先が分かりません user=${row.buyer_id}`)),
    出品者宛
      ? sendMail({ to: 出品者宛, ...paymentCompletedSellerMail(data) })
      : Promise.resolve(console.error(`[notify] 出品者の宛先が分かりません user=${row.seller_id}`)),
  ]);
}

/**
 * 課金が成立しなかったことを記録する。
 * 既に決済済みの行は触らない（Webhook が前後して届いても、成立を上書きしない）。
 */
export async function markReservationPaymentFailed(args: {
  reservationId: string;
  provider: ProviderName;
  paymentIntentId?: string | null;
  status: "requires_action" | "failed" | "disputed";
  errorCode?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("reservations")
    .update({
      payment_provider: args.provider,
      payment_intent_id: args.paymentIntentId ?? null,
      payment_status: args.status,
      payment_error_code: args.errorCode ?? null,
    })
    .eq("id", args.reservationId)
    .is("paid_at", null);
  if (error) {
    console.error("failed to record payment failure:", error.message, args.reservationId);
  }
}

/**
 * 受け渡しQRのワンタイム nonce を「1文で」奪う。
 *
 * 検証してから消費するまでの間に隙間があると、同じQRを2回読んだときに
 * 両方が検証を通過して二重課金になる。この UPDATE ... WHERE hash = ? は
 * 最初の1回しか行に当たらないので、後続は0行＝取り損ねたと判定できる。
 *
 * 戻り値 false は「他の処理が先に取った（＝処理中か、もう課金済み）」。
 */
export async function claimPaymentNonce(
  reservationId: string,
  nonceHash: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reservations")
    .update({ payment_nonce_hash: null })
    .eq("id", reservationId)
    .eq("payment_nonce_hash", nonceHash)
    .select("id");
  if (error) {
    console.error("failed to claim payment nonce:", error.message, reservationId);
    return false;
  }
  return !!data && data.length > 0;
}
