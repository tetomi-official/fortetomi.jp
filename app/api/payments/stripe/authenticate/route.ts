import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { PAYMENT_PROVIDER } from "@/lib/payment-provider";
import { getStripeClient } from "@/lib/payment-provider/stripe-client";

// 受け渡し時の課金でカード会社が本人認証（3DS）を求めた場合に、買い手の端末で
// 認証をやり直すための client secret を返す。
//
// 買い手はその場（対面）にいるので、出品者が読み取った直後でも復旧できる。
// 返すのは client secret だけ。保存済みカード(pm_)や顧客(cus_)は返さない
// ——ブラウザに渡す必要が無く、渡せば他の用途に使える材料を増やすだけなので。
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

  const rl = await checkRateLimit(`authenticate:${user.id}`, 20, 600);
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
    .select("id, buyer_id, paid_at, payment_status, payment_intent_id")
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation) {
    return NextResponse.json({ error: "対象の購入希望が見つかりません" }, { status: 404 });
  }
  // 認証をやり直せるのは買い手本人だけ。
  if (reservation.buyer_id !== user.id) {
    return NextResponse.json({ error: "この操作を行う権限がありません" }, { status: 403 });
  }
  if (reservation.paid_at) {
    return NextResponse.json({ error: "この取引は決済済みです" }, { status: 409 });
  }
  // 本人認証待ち以外で client secret を配らない（無関係な決済の再開に使わせない）。
  if (reservation.payment_status !== "requires_action" || !reservation.payment_intent_id) {
    return NextResponse.json({ error: "認証が必要な決済がありません" }, { status: 409 });
  }

  try {
    const stripe = getStripeClient(secretKey);
    const pi = await stripe.paymentIntents.retrieve(reservation.payment_intent_id);
    if (pi.status === "succeeded") {
      // 認証が別経路で完了していた。記録は confirm-status / Webhook が行う。
      return NextResponse.json({ alreadySucceeded: true });
    }
    if (!pi.client_secret) {
      return NextResponse.json({ error: "認証を開始できませんでした" }, { status: 502 });
    }
    return NextResponse.json({ clientSecret: pi.client_secret });
  } catch (e) {
    console.error("failed to retrieve payment intent for authentication:", e);
    return NextResponse.json({ error: "認証を開始できませんでした" }, { status: 502 });
  }
}
