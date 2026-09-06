import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getProvider, providerConfigError } from "@/lib/payment-provider";
import { loadStoredCustomer } from "@/lib/payment-provider/customers";
import { isSellerReadyToReceive } from "@/lib/payment-provider/stripe-connect";

// 受け渡しQR用のワンタイム nonce を発行する（買い手本人）。PB-036 Phase 1。
//  - 生の nonce は返り値（QRに載せる）だけに存在し、DB には SHA-256 ハッシュのみ保存する。
//  - これにより「出品者が予約行を読めても nonce は得られない」＝買い手がQRを提示した時だけ課金できる。
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export async function POST(req: Request) {
  const cfgErr = providerConfigError();
  if (cfgErr) {
    return NextResponse.json({ error: cfgErr }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  // レート制限：QR用 nonce 発行の乱発を抑止（30回/10分/ユーザー）。
  const rl = await checkRateLimit(`nonce:${user.id}`, 30, 600);
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
    .select("id, buyer_id, seller_id, status, paid_at")
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation) {
    return NextResponse.json({ error: "対象の購入希望が見つかりません" }, { status: 404 });
  }
  // 買い手本人のみ。
  if (reservation.buyer_id !== user.id) {
    return NextResponse.json({ error: "この操作を行う権限がありません" }, { status: 403 });
  }
  if (reservation.paid_at) {
    return NextResponse.json({ error: "この取引は決済済みです" }, { status: 409 });
  }
  // 出品者が候補を承認（承認済み）してから受け渡し＝決済に進む。
  if (reservation.status !== "承認済み") {
    return NextResponse.json(
      { error: "出品者が受け渡し日を承認するまでお待ちください" },
      { status: 409 },
    );
  }

  // 今の決済会社で課金できるカードが無ければQRを出さない。
  // 「行があるか」ではなく「その決済会社のIDが入っているか」で見る。決済会社を
  // 切り替えた直後に、課金できないQRを買い手へ渡してしまうのを防ぐため。
  const provider = getProvider();
  const customer = await loadStoredCustomer(user.id);
  if (!provider.hasUsableCard(customer)) {
    return NextResponse.json(
      { error: "先に支払いカードの登録が必要です", needsCard: true },
      { status: 400 },
    );
  }

  // 出品者が送金を受け取れないうちはQRを出さない。ここで止めるのが一番大事で、
  // 通さないと買い手が待ち合わせ場所で「課金できないQR」を出すことになる。
  // 見るのは「送金を受け取れるか」だけ（銀行口座への入金がまだでも課金は成立し、
  // 売上は出品者の Stripe 残高に貯まる）。
  if (provider.requiresSellerOnboarding) {
    const seller = await isSellerReadyToReceive(
      process.env.STRIPE_SECRET_KEY ?? "",
      reservation.seller_id,
    );
    if (!seller.ready) {
      return NextResponse.json(
        {
          error: "出品者の受取口座の設定が完了していません。出品者にご確認ください。",
          sellerNotReady: true,
        },
        { status: 409 },
      );
    }
  }

  // 生の nonce を発行し、ハッシュだけ保存する。
  const nonce = randomBytes(32).toString("hex");
  const { error: updErr } = await admin
    .from("reservations")
    .update({ payment_nonce_hash: sha256(nonce) })
    .eq("id", reservationId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ nonce });
}
