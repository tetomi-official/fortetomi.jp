import { createAdminClient } from "@/lib/supabase/admin";
import { resolveNotifyEmail, sendMail } from "@/lib/mail";
import { handoverReminderMail, type ReservationMailData } from "@/lib/mail-templates";
import { confirmedHandoverDate, reminderTargetDate } from "@/lib/handover-reminder";
import type { CandidateSlot, ReminderKind } from "@/lib/types";

// ===================================================
// 受け渡しリマインドの送信（サーバー専用・#58）
// ---------------------------------------------------
// 日程が決まったあと当日まで何も届かないと、そのまま忘れられて取引が流れる。
// 定時実行（.github/workflows/handover-reminder.yml）から
// app/api/cron/handover-reminder 経由でここを呼ぶ。
//
// 二度送りを防ぐしくみ：
//   handover_reminders の主キー（予約・回・相手）が重複を弾く。
//   **先に記録を入れてから送る。** 送ってから記録すると、記録の書き込みに失敗したとき
//   次の回でもう一度送ってしまう。逆に、送信に失敗したときは記録を消して、
//   次の回で拾い直せるようにする。
//
// ここは何があっても例外を投げない。1件の失敗で残りの送信を止めない。
// ===================================================

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
  listings: { title: string | null } | null;
  buyer: { name: string | null } | null;
  seller: { name: string | null } | null;
};

export type ReminderResult = {
  kind: ReminderKind;
  /** 対象にした受け渡し日（YYYY-MM-DD・日本時間）。 */
  targetDate: string;
  /** その日に受け渡しがある予約の件数。 */
  reservations: number;
  /** 送れた通数。 */
  sent: number;
  /** すでに送ってあったので飛ばした通数。 */
  skipped: number;
  /** 送れなかった通数（次の回で拾い直す）。 */
  failed: number;
};

const SIDES = ["buyer", "seller"] as const;

/** 指定の回のリマインドをまとめて送る。 */
export async function sendHandoverReminders(
  kind: ReminderKind,
  now: Date = new Date(),
): Promise<ReminderResult> {
  const targetDate = reminderTargetDate(kind, now);
  const result: ReminderResult = { kind, targetDate, reservations: 0, sent: 0, skipped: 0, failed: 0 };
  const admin = createAdminClient();

  // 日程が決まっていて、まだ終わっていない取引だけ。
  // 受け渡し日は proposed_date か candidate_slots の中にあり、SQL では絞り込めないので、
  // 承認済みのぶんを取ってきてから日付で選ぶ（承認済みは常に少数）。
  const { data, error } = await admin
    .from("reservations")
    .select(
      "id, buyer_id, seller_id, price, preferred_location, candidate_slots, selected_slot, " +
        "proposed_date, proposed_time, proposed_location, " +
        "listings(title), buyer:profiles!buyer_id(name), seller:profiles!seller_id(name)",
    )
    .eq("status", "承認済み")
    .is("paid_at", null);
  if (error) {
    console.error("[reminder] 予約の取得に失敗:", error.message);
    return result;
  }

  const 対象 = ((data ?? []) as unknown as Row[]).filter(
    (r) => confirmedHandoverDate(r) === targetDate,
  );
  result.reservations = 対象.length;

  for (const r of 対象) {
    const mailData: ReservationMailData = {
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
    };

    for (const side of SIDES) {
      try {
        // 先に「送る」と記録する。すでに行があれば主キーで弾かれ、二度送りにならない。
        const { error: claimError } = await admin
          .from("handover_reminders")
          .insert({ reservation_id: r.id, kind, side });
        if (claimError) {
          // 23505 = 主キーの重複。送信済み（または同時に走った回が先に取った）。
          if (claimError.code === "23505") result.skipped++;
          else {
            console.error(`[reminder] 記録に失敗 id=${r.id} side=${side}:`, claimError.message);
            result.failed++;
          }
          continue;
        }

        const to = await resolveNotifyEmail(admin, side === "buyer" ? r.buyer_id : r.seller_id);
        const mail = handoverReminderMail(mailData, side, kind);
        const ok = to ? await sendMail({ to, subject: mail.subject, html: mail.html }) : false;
        if (ok) {
          result.sent++;
          continue;
        }
        if (!to) console.error(`[reminder] 宛先のメールアドレスが分かりません id=${r.id} side=${side}`);
        // 送れなかったので記録を消す。次の回で拾い直す。
        await admin
          .from("handover_reminders")
          .delete()
          .eq("reservation_id", r.id)
          .eq("kind", kind)
          .eq("side", side);
        result.failed++;
      } catch (e) {
        console.error(`[reminder] 送信で例外 id=${r.id} side=${side}:`, e);
        result.failed++;
      }
    }
  }

  console.info(
    `[reminder] ${kind} 受け渡し日=${targetDate} 対象=${result.reservations}件 ` +
      `送信=${result.sent} 済み=${result.skipped} 失敗=${result.failed}`,
  );
  return result;
}
