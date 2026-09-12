import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
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
// 取引の通知メール（購入希望・日程確定・逆提案・取りやめ）
// ---------------------------------------------------
// 予約の書き込みはブラウザから直接 Supabase へ行う設計（サーバーアクションが無い）
// ため、書き込みが成功したあとにクライアントがここを叩いて通知を出す。
//
// クライアントの言い分は信じない。予約を service_role で読み直し、
//   - 呼び出した人が当事者か
//   - 今のステータスが申告どおりか
// を確かめてから送る。宛先も「相手方」としてサーバーが決める（指定させない）。
//
// 決済完了だけはここではなく lib/payment-provider/reconcile.ts から送る。
// あちらはサーバー処理なので、ブラウザが閉じられても確実に飛ぶ。
// ===================================================

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 通知を出す出来事。 */
const EVENTS = ["created", "approved", "rescheduled", "cancelled"] as const;
type Event = (typeof EVENTS)[number];

/** 結合込みの取得結果。Supabase の型推論は結合を追えないので、lib/reservations.ts と同じく明示する。 */
type Row = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  price: number;
  status: string;
  paid_at: string | null;
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

/** その出来事のとき、予約はこのステータスになっているはず。 */
const EXPECTED_STATUS: Record<Event, string> = {
  created: "申請中",
  approved: "承認済み",
  rescheduled: "日程調整中",
  cancelled: "キャンセル",
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  // 乱発を抑止（30回/10分/ユーザー）。通知は操作1回につき1通なので十分な余裕がある。
  const rl = await checkRateLimit(`notify:${user.id}`, 30, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "操作が多すぎます。しばらくしてからお試しください。" },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    reservationId?: unknown;
    event?: unknown;
  } | null;
  const reservationId = typeof body?.reservationId === "string" ? body.reservationId : "";
  const event = EVENTS.find((e) => e === body?.event);
  if (!UUID_RE.test(reservationId) || !event) {
    return NextResponse.json({ error: "対象の購入希望が見つかりません" }, { status: 404 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    // 通知が出せないだけで操作自体は成功している。呼び出し側を失敗にはしない。
    console.error("[notify] service_role キーが未設定のため通知を送れません");
    return NextResponse.json({ ok: false, skipped: "config" });
  }

  const { data: found } = await admin
    .from("reservations")
    .select(
      "id, listing_id, buyer_id, seller_id, price, status, paid_at, preferred_location, " +
        "candidate_slots, selected_slot, proposed_date, proposed_time, proposed_location, message, " +
        "listings(title), buyer:profiles!buyer_id(name), seller:profiles!seller_id(name)",
    )
    .eq("id", reservationId)
    .maybeSingle();
  if (!found) {
    return NextResponse.json({ error: "対象の購入希望が見つかりません" }, { status: 404 });
  }
  const r = found as unknown as Row;

  // 当事者だけ。
  const 呼んだ人: "buyer" | "seller" | null =
    r.buyer_id === user.id ? "buyer" : r.seller_id === user.id ? "seller" : null;
  if (!呼んだ人) {
    return NextResponse.json({ error: "この操作を行う権限がありません" }, { status: 403 });
  }

  // 申告された出来事と、いまのDBの状態が食い違っていたら送らない。
  if (r.status !== EXPECTED_STATUS[event]) {
    return NextResponse.json(
      { error: "購入希望の状態が変わっています" },
      { status: 409 },
    );
  }

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

  // 宛先は常に「相手方」。クライアントには選ばせない。
  const 宛先側: "buyer" | "seller" = 呼んだ人 === "buyer" ? "seller" : "buyer";
  const 宛先ID = 宛先側 === "buyer" ? r.buyer_id : r.seller_id;

  const mail =
    event === "created"
      ? purchaseRequestMail(data)
      : event === "approved"
        ? scheduleConfirmedMail(data, 宛先側)
        : event === "rescheduled"
          ? rescheduleProposedMail(data)
          : reservationCancelledMail(data, 呼んだ人);

  const to = await resolveNotifyEmail(admin, 宛先ID);
  if (!to) {
    console.error(`[notify] 宛先のメールアドレスが分かりません user=${宛先ID}`);
    return NextResponse.json({ ok: false, skipped: "no-address" });
  }

  const sent = await sendMail({ to, subject: mail.subject, html: mail.html });
  return NextResponse.json({ ok: sent });
}
