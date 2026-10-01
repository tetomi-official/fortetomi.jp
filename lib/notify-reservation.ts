import { createAdminClient } from "@/lib/supabase/admin";
import { resolveNotifyEmail, sendMail } from "@/lib/mail";
import {
  purchaseRequestMail,
  rescheduleProposedMail,
  reservationCancelledMail,
  scheduleConfirmedMail,
  type ReservationMailData,
} from "@/lib/mail-templates";
import type { CandidateSlot } from "@/lib/types";

// ===================================================
// 取引の通知メール（サーバー専用）
// ---------------------------------------------------
// 予約の書き込みを行った API ルートから、同じリクエストの中で呼ぶ。
// 「書き込めたのにメールだけ飛ばない」が構造的に起きないようにするため、
// ブラウザに送信を依頼する形は取らない。
//
// 決済完了だけは別で、lib/payment-provider/reconcile.ts から送る
// （課金の記録と同じ場所でないと、Webhook 経由の成立を拾えないため）。
//
// ここは何があっても例外を投げない。メールの失敗で取引の操作を巻き戻さない。
// ===================================================

export type ReservationEvent = "created" | "approved" | "rescheduled" | "cancelled";

type Row = {
  id: string;
  buyer_id: string;
  seller_id: string;
  price: number;
  preferred_location: string;
  candidate_slots: CandidateSlot[] | null;
  selected_slot: number | null;
  proposed_date: string | null;
  proposed_time: string | null;
  proposed_location: string | null;
  message: string | null;
  listings: { title: string | null } | null;
  buyer: { name: string | null } | null;
  seller: { name: string | null } | null;
};

/**
 * 取引の動きを相手方にメールで知らせる。
 *
 * @param actor 操作した人。宛先はその「相手」になる（出品者が確定→買い手へ、
 *              買い手が逆提案を承諾→出品者へ）。
 */
export async function notifyReservationEvent(args: {
  reservationId: string;
  event: ReservationEvent;
  actor: "buyer" | "seller";
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: found } = await admin
      .from("reservations")
      .select(
        "id, buyer_id, seller_id, price, preferred_location, candidate_slots, selected_slot, " +
          "proposed_date, proposed_time, proposed_location, message, " +
          "listings(title), buyer:profiles!buyer_id(name), seller:profiles!seller_id(name)",
      )
      .eq("id", args.reservationId)
      .maybeSingle();
    if (!found) {
      console.error(`[notify] 予約が見つかりません id=${args.reservationId}`);
      return;
    }
    const r = found as unknown as Row;

    const data: ReservationMailData = {
      reservationId: r.id,
      listingTitle: r.listings?.title ?? "（削除された教科書）",
      price: r.price,
      buyerName: r.buyer?.name ?? "購入希望者",
      sellerName: r.seller?.name ?? "出品者",
      candidateSlots: r.candidate_slots ?? undefined,
      selectedSlot: r.selected_slot ?? undefined,
      proposedDate: r.proposed_date ?? undefined,
      proposedTime: r.proposed_time ?? undefined,
      proposedLocation: r.proposed_location ?? undefined,
      location: r.preferred_location,
      message: r.message ?? undefined,
    };

    // 宛先は必ず相手方。
    const 宛先側: "buyer" | "seller" = args.actor === "buyer" ? "seller" : "buyer";
    const 宛先ID = 宛先側 === "buyer" ? r.buyer_id : r.seller_id;

    const mail =
      args.event === "created"
        ? purchaseRequestMail(data)
        : args.event === "approved"
          ? scheduleConfirmedMail(data, 宛先側)
          : args.event === "rescheduled"
            ? rescheduleProposedMail(data)
            : reservationCancelledMail(data, args.actor);

    const to = await resolveNotifyEmail(admin, 宛先ID);
    if (!to) {
      console.error(`[notify] 宛先のメールアドレスが分かりません user=${宛先ID}`);
      return;
    }
    await sendMail({ to, subject: mail.subject, html: mail.html });
  } catch (e) {
    console.error("[notify] 通知の送信に失敗:", e);
  }
}
