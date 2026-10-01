import { createAdminClient } from "@/lib/supabase/admin";
import { resolveNotifyEmail, sendMail } from "@/lib/mail";
import { newMessageMail } from "@/lib/mail-templates";

// ===================================================
// 新着メッセージの通知メール（サーバー専用）
// ---------------------------------------------------
// POST /api/messages が書き込みに成功したあと、同じリクエストの中から呼ぶ。
//
// 送りすぎない決まり（#59）:
//   **相手がまだ読んでいない知らせが既にあるときは送らない。**
//   言いかえると、相手が最後にスレッドを開いたあとの「1通目」だけ送る。
//   連投しても増えず、相手がアプリで開いて既読になれば、また次の1通で届く。
//
// 相手がその場で画面を見ている場合も送らない。画面はメッセージを受け取ると
// すぐ既読を書くので、少し待ってから未読を数えれば「見ている人」には送らずに済む。
//
// ここは何があっても例外を投げない。メールの失敗でメッセージ送信を巻き戻さない。
// ===================================================

/** 既読が一度も無い相手のための「大昔」。 */
const 大昔 = "1970-01-01T00:00:00Z";

/**
 * 画面が既読を書き終えるのを待つ時間。
 * 相手がスレッドを開いたままのときに、わざわざメールしないための間。
 */
const 既読待ち_MS = 5000;

type Row = {
  id: string;
  buyer_id: string;
  seller_id: string;
  listings: { title: string | null } | null;
  buyer: { name: string | null } | null;
  seller: { name: string | null } | null;
};

export async function notifyNewMessage(args: {
  reservationId: string;
  senderId: string;
}): Promise<void> {
  try {
    await new Promise((r) => setTimeout(r, 既読待ち_MS));

    const admin = createAdminClient();
    const { data: found } = await admin
      .from("reservations")
      .select(
        "id, buyer_id, seller_id, " +
          "listings(title), buyer:profiles!buyer_id(name), seller:profiles!seller_id(name)",
      )
      .eq("id", args.reservationId)
      .maybeSingle();
    if (!found) {
      console.error(`[notify] 取引が見つかりません id=${args.reservationId}`);
      return;
    }
    const r = found as unknown as Row;

    // 送った人の相手が宛先。
    const 送り手が買い手 = r.buyer_id === args.senderId;
    const 宛先ID = 送り手が買い手 ? r.seller_id : r.buyer_id;
    const 送信者名 = (送り手が買い手 ? r.buyer?.name : r.seller?.name) ?? "お相手";

    // 宛先がこのスレッドを最後に開いた時刻。
    const { data: 既読 } = await admin
      .from("message_reads")
      .select("last_read_at")
      .eq("reservation_id", r.id)
      .eq("user_id", 宛先ID)
      .maybeSingle();

    // そのあとに届いた（宛先から見た）相手のメッセージの数＝未読の数。
    const { count, error } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("reservation_id", r.id)
      .neq("sender_id", 宛先ID)
      .gt("created_at", 既読?.last_read_at ?? 大昔);
    if (error) {
      console.error("[notify] 未読の数を数えられません:", error.message);
      return;
    }
    // 0 なら既に読まれている（画面を開いている）。2 以上なら前の知らせがまだ未読。
    if (count !== 1) {
      console.info(`[notify] メッセージの知らせは送らない（未読 ${count} 件） id=${r.id}`);
      return;
    }

    const to = await resolveNotifyEmail(admin, 宛先ID);
    if (!to) {
      console.error(`[notify] 宛先のメールアドレスが分かりません user=${宛先ID}`);
      return;
    }
    const mail = newMessageMail({
      reservationId: r.id,
      listingTitle: r.listings?.title ?? "（削除された教科書）",
      senderName: 送信者名,
    });
    await sendMail({ to, subject: mail.subject, html: mail.html });
  } catch (e) {
    console.error("[notify] メッセージの知らせに失敗:", e);
  }
}
