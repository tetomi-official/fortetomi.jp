import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { PAYMENT_PROVIDER } from "@/lib/payment-provider";
import { getStripeClient } from "@/lib/payment-provider/stripe-client";
import { markReservationPaid } from "@/lib/payment-provider/reconcile";

// 買い手の端末で本人認証（3DS）が終わった直後に呼ぶ。
//
// Webhook（payment_intent.succeeded）でも同じ記録が行われるが、それを待つと
// 対面で数秒〜数十秒待たされる。ここで即座に確定させる。
// markReservationPaid は冪等なので、Webhook と競合しても二重に記録されない。
//
// 判定材料はクライアントの申告ではなく、サーバーが Stripe から取り直した状態。
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (PAYMENT_PROVIDER !== "stripe") {
    return NextResponse.json({ error: "この決済方式では利用できません" }, { status: 400 });
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "決済の設定が未完了です" }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const rl = await checkRateLimit(`confirm:${user.id}`, 30, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "操作が多すぎます。しばらくしてからお試しください。" },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as { reservationId?: unknown } | null;
  const reservationId = typeof body?.reservationId === "string" ? body.reservationId : "";
  if (!UUID_RE.test(reservationId)) {
    return NextResponse.json({ error: "対象の購入希望が見つかりません" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: reservation } = await admin
    .from("reservations")
    .select("id, buyer_id, seller_id, paid_at, payment_intent_id")
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation) {
    return NextResponse.json({ error: "対象の購入希望が見つかりません" }, { status: 404 });
  }
  // 当事者（買い手 or 出品者）のみ。出品者側の画面からも確定を促せるようにする。
  if (reservation.buyer_id !== user.id && reservation.seller_id !== user.id) {
    return NextResponse.json({ error: "この操作を行う権限がありません" }, { status: 403 });
  }
  if (reservation.paid_at) {
    return NextResponse.json({ paid: true });
  }
  if (!reservation.payment_intent_id) {
    return NextResponse.json({ error: "対象の決済がありません" }, { status: 409 });
  }

  try {
    const stripe = getStripeClient(secretKey);
    const pi = await stripe.paymentIntents.retrieve(reservation.payment_intent_id);
    if (pi.status !== "succeeded") {
      return NextResponse.json({ paid: false, status: pi.status });
    }
    const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : null;
    if (!chargeId) {
      return NextResponse.json({ paid: false, status: pi.status });
    }

    const marked = await markReservationPaid({
      reservationId: reservation.id,
      chargeId,
      provider: "stripe",
      paymentIntentId: pi.id,
    });
    if (!marked.ok) {
      console.error("confirm-status: DB update failed:", marked.error, pi.id);
      return NextResponse.json(
        { error: "決済は成立しましたが記録に失敗しました。運営にお問い合わせください。" },
        { status: 500 },
      );
    }
    return NextResponse.json({ paid: true, chargeId });
  } catch (e) {
    console.error("confirm-status failed:", e);
    return NextResponse.json({ error: "状態を確認できませんでした" }, { status: 502 });
  }
}
