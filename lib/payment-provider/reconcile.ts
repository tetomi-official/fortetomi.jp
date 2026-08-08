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
}): Promise<MarkPaidResult> {
  const admin = createAdminClient();

  const { data: updated, error } = await admin
    .from("reservations")
    .update({
      charge_id: args.chargeId,
      paid_at: new Date().toISOString(),
      status: "完了",
      payment_nonce_hash: null,
    })
    .eq("id", args.reservationId)
    .is("paid_at", null) // 二重更新防止（同時到達しても片方だけ）
    .select("id, listing_id");

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
  return { ok: true, alreadyPaid: false, error: null };
}
