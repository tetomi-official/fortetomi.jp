import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 受け渡し課金（PAY.jp Charge 作成）。PB-036 Phase 1（QRモデル）。
// フロー：出品者が対面で「買い手が表示したQR（生 nonce）」を読み取り、このAPIを呼ぶ。
//  - 認証は出品者本人（auth.getUser）。予約の seller 本人だけが受け渡し課金できる。
//  - nonce のハッシュが予約の payment_nonce_hash と一致すること＝買い手がQRを提示した証明。
//  - 金額は reservations.price をサーバーで再取得（改ざん防止）。
//  - 課金先は買い手の保存済みカード（payment_customers.payjp_customer_id）。カード情報は通らない。
//  - 成功で status「完了」・charge_id・paid_at を記録し、nonce ハッシュを消費（null 化）する。
export const runtime = "nodejs";

const PAYJP_CHARGES = "https://api.pay.jp/v1/charges";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export async function POST(req: Request) {
  const secretKey = process.env.PAYJP_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: "決済の設定が未完了です（PAYJP_SECRET_KEY 未設定）" },
      { status: 500 },
    );
  }

  // 1) 認証（出品者本人）
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  // 2) 入力（reservationId + 生 nonce）
  const body = (await req.json().catch(() => null)) as {
    reservationId?: unknown;
    nonce?: unknown;
  } | null;
  const reservationId = typeof body?.reservationId === "string" ? body.reservationId : "";
  const nonce = typeof body?.nonce === "string" ? body.nonce : "";
  if (!reservationId || !nonce) {
    return NextResponse.json({ error: "QRの読み取りに失敗しました" }, { status: 400 });
  }
  if (!UUID_RE.test(reservationId)) {
    return NextResponse.json({ error: "対象の購入希望が見つかりません" }, { status: 404 });
  }

  // 3) 予約を admin で取得し、当事者・状態・金額・nonce をサーバー側で確定
  const admin = createAdminClient();
  const { data: reservation, error: resErr } = await admin
    .from("reservations")
    .select("id, listing_id, buyer_id, seller_id, price, status, paid_at, payment_nonce_hash")
    .eq("id", reservationId)
    .maybeSingle();
  if (resErr) {
    return NextResponse.json({ error: resErr.message }, { status: 500 });
  }
  if (!reservation) {
    return NextResponse.json({ error: "対象の購入希望が見つかりません" }, { status: 404 });
  }
  // 受け渡し課金は「出品者本人」だけが実行できる。
  if (reservation.seller_id !== user.id) {
    return NextResponse.json({ error: "この取引を決済する権限がありません" }, { status: 403 });
  }
  if (reservation.paid_at) {
    return NextResponse.json({ error: "この取引は決済済みです" }, { status: 409 });
  }
  if (reservation.status !== "承認済み") {
    return NextResponse.json({ error: "承認済みの取引のみ決済できます" }, { status: 409 });
  }
  // nonce 検証：買い手がQRを提示した証明。ハッシュ不一致・未発行は弾く。
  if (!reservation.payment_nonce_hash || reservation.payment_nonce_hash !== sha256(nonce)) {
    return NextResponse.json(
      { error: "QRが無効です。買い手にQRを再表示してもらってください。" },
      { status: 409 },
    );
  }

  const amount = reservation.price;
  if (!Number.isInteger(amount) || amount < 50) {
    // PAY.jp の最小課金額は 50円。
    return NextResponse.json({ error: "金額が不正です" }, { status: 400 });
  }

  // 4) 買い手の保存済みカード（Customer）を取得
  const { data: customer } = await admin
    .from("payment_customers")
    .select("payjp_customer_id")
    .eq("user_id", reservation.buyer_id)
    .maybeSingle();
  if (!customer?.payjp_customer_id) {
    return NextResponse.json(
      { error: "買い手のカードが登録されていません" },
      { status: 409 },
    );
  }

  // 5) PAY.jp へ課金（保存済み Customer の既定カードに対して）
  const auth = Buffer.from(`${secretKey}:`).toString("base64");
  const params = new URLSearchParams({
    amount: String(amount),
    currency: "jpy",
    customer: customer.payjp_customer_id,
    description: `reservation:${reservation.id}`,
  });
  type ChargeResult = { id?: string; paid?: boolean; error?: { message?: string } };
  let chargeId = "";
  let chargePaid = false;
  try {
    const payjpRes = await fetch(PAYJP_CHARGES, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const charge = (await payjpRes.json().catch(() => null)) as ChargeResult | null;
    if (!payjpRes.ok || !charge?.id) {
      return NextResponse.json(
        { error: charge?.error?.message ?? "決済に失敗しました" },
        { status: 402 },
      );
    }
    chargeId = charge.id;
    chargePaid = charge.paid === true;
  } catch {
    return NextResponse.json({ error: "決済の通信に失敗しました" }, { status: 502 });
  }

  // 6) 成功：決済結果を記録し、取引を完了へ。nonce は消費（再利用防止）。
  const { error: updErr } = await admin
    .from("reservations")
    .update({
      charge_id: chargeId,
      paid_at: new Date().toISOString(),
      status: "完了",
      payment_nonce_hash: null,
    })
    .eq("id", reservation.id);
  if (updErr) {
    // 課金は成立しているため、記録失敗はサーバーログに残し 500 で通知（手動突合が必要）。
    console.error("charge recorded on PAY.jp but DB update failed:", updErr.message, chargeId);
    return NextResponse.json(
      { error: "決済は成立しましたが記録に失敗しました。運営にお問い合わせください。", chargeId },
      { status: 500 },
    );
  }

  // 出品を「完了」にして一覧から実質的に落とす（売り切れ表示）。
  if (reservation.listing_id) {
    await admin.from("listings").update({ status: "完了" }).eq("id", reservation.listing_id);
  }

  return NextResponse.json({ chargeId, paid: chargePaid });
}
