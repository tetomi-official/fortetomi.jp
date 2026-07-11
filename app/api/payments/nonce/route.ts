import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 受け渡しQR用のワンタイム nonce を発行する（買い手本人）。PB-036 Phase 1。
//  - 生の nonce は返り値（QRに載せる）だけに存在し、DB には SHA-256 ハッシュのみ保存する。
//  - これにより「出品者が予約行を読めても nonce は得られない」＝買い手がQRを提示した時だけ課金できる。
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { reservationId?: unknown } | null;
  const reservationId = typeof body?.reservationId === "string" ? body.reservationId : "";
  if (!UUID_RE.test(reservationId)) {
    return NextResponse.json({ error: "対象の購入希望が見つかりません" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: reservation } = await admin
    .from("reservations")
    .select("id, buyer_id, status, paid_at")
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

  // カード登録済みでなければQRを出さない（受け渡し時に課金できないため）。
  const { data: customer } = await admin
    .from("payment_customers")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!customer) {
    return NextResponse.json(
      { error: "先に支払いカードの登録が必要です", needsCard: true },
      { status: 400 },
    );
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
