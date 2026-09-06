import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getProvider, providerConfigError } from "@/lib/payment-provider";
import { loadStoredCustomer } from "@/lib/payment-provider/customers";
import { loadConnectAccountRow } from "@/lib/payment-provider/stripe-connect";
import { applicationFeeAmount } from "@/lib/payment-provider/fees";
import {
  claimPaymentNonce,
  markReservationPaid,
  markReservationPaymentFailed,
} from "@/lib/payment-provider/reconcile";

// 受け渡し課金。PB-036 Phase 1（QRモデル）。
// フロー：出品者が対面で「買い手が表示したQR（生 nonce）」を読み取り、このAPIを呼ぶ。
//  - 認証は出品者本人（auth.getUser）。予約の seller 本人だけが受け渡し課金できる。
//  - nonce のハッシュが予約の payment_nonce_hash と一致すること＝買い手がQRを提示した証明。
//  - 金額は reservations.price をサーバーで再取得（改ざん防止）。
//  - 課金先は買い手の保存済みカード。カード情報はこのサーバーを通らない。
//  - 成功で status「完了」・charge_id・paid_at を記録し、nonce ハッシュを消費（null 化）する。
//
// 決済会社ごとの違い（PAY.jp / Stripe）は lib/payment-provider の裏に閉じている。
// ここに残しているのは、決済会社に依存しない検証と記録だけ。
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

  // 1) 認証（出品者本人）
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  // 1.5) レート制限：課金試行の乱発を抑止（30回/10分/出品者）。
  const rl = await checkRateLimit(`charge:${user.id}`, 30, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "操作が多すぎます。しばらくしてからお試しください。" },
      { status: 429 },
    );
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
  const nonceHash = sha256(nonce);
  if (!reservation.payment_nonce_hash || reservation.payment_nonce_hash !== nonceHash) {
    return NextResponse.json(
      { error: "QRが無効です。買い手にQRを再表示してもらってください。" },
      { status: 409 },
    );
  }

  const provider = getProvider();
  const amount = reservation.price;
  if (!Number.isInteger(amount) || amount < provider.minimumAmountJpy) {
    return NextResponse.json({ error: "金額が不正です" }, { status: 400 });
  }

  // 4) 買い手の保存済みカードを取得
  const customer = await loadStoredCustomer(reservation.buyer_id);
  if (!provider.hasUsableCard(customer) || !customer) {
    return NextResponse.json({ error: "買い手のカードが登録されていません" }, { status: 409 });
  }

  // 4.5) 出品者が送金を受け取れるか。nonce 発行時にも見ているが、QR発行後に
  //      口座が無効化されることがあるので、課金の直前にもう一度確認する。
  //      判定は「送金を受け取れるか」だけ。銀行口座への入金がまだでも課金は成立し、
  //      売上は出品者の Stripe 残高に貯まる（案A・PO決定）。
  let sellerAccountId: string | null = null;
  if (provider.requiresSellerOnboarding) {
    const sellerAccount = await loadConnectAccountRow(reservation.seller_id);
    if (!sellerAccount?.transfersEnabled) {
      return NextResponse.json(
        { error: "出品者の受取口座の設定が完了していません。出品者にご確認ください。", sellerNotReady: true },
        { status: 409 },
      );
    }
    sellerAccountId = sellerAccount.stripeAccountId;
  }

  // 4.6) nonce を原子的に奪う。ここを通れたリクエストだけが課金に進む。
  //      検証（上）と消費（ここ）の間に隙間があると、同じQRの二度読みで
  //      両方が課金に進んでしまう。取り損ねたら他が処理中とみなす。
  const claimed = await claimPaymentNonce(reservation.id, nonceHash);
  if (!claimed) {
    return NextResponse.json(
      { error: "この取引は処理中です。少し待って、必要なら買い手にQRを再表示してもらってください。" },
      { status: 409 },
    );
  }

  // 5) 課金（決済会社の実装に委譲）。charge() は例外を投げない。
  const outcome = await provider.charge({
    reservationId: reservation.id,
    amountJpy: amount,
    buyerUserId: reservation.buyer_id,
    sellerUserId: reservation.seller_id,
    customer,
    sellerAccountId,
    applicationFeeJpy: provider.requiresSellerOnboarding ? applicationFeeAmount(amount) : 0,
    // 同じQRを二度読みしても同じ課金として扱わせるためのキー。
    idempotencyKey: `${provider.name}:charge:${reservation.id}:${nonceHash.slice(0, 16)}`,
    description: `reservation:${reservation.id}`,
    metadata: {
      reservation_id: reservation.id,
      buyer_id: reservation.buyer_id,
      seller_id: reservation.seller_id,
    },
  });

  // 課金に至らなかった場合、nonce は上で消費済み。買い手にQRを出し直してもらう
  // 必要があるため、どの分岐でもその旨が伝わる文言にしている。
  if (outcome.kind === "error") {
    return NextResponse.json({ error: outcome.message }, { status: outcome.httpStatus });
  }
  if (outcome.kind === "declined") {
    await markReservationPaymentFailed({
      reservationId: reservation.id,
      provider: provider.name,
      status: "failed",
      errorCode: outcome.code || null,
    });
    return NextResponse.json(
      { error: `${outcome.message}（買い手にQRを再表示してもらってください）` },
      { status: 402 },
    );
  }
  if (outcome.kind === "requires_action") {
    // 買い手のカード会社が本人認証を求めた。買い手はその場にいるので復旧できる。
    // 復旧フロー（買い手の端末で3DSを出す）の実装は S6。
    await markReservationPaymentFailed({
      reservationId: reservation.id,
      provider: provider.name,
      paymentIntentId: outcome.paymentIntentId,
      status: "requires_action",
      errorCode: "authentication_required",
    });
    return NextResponse.json(
      {
        error: "買い手のカード会社による本人認証が必要です。買い手の画面で認証を完了してください。",
        requiresAction: true,
      },
      { status: 409 },
    );
  }

  // 6) 成功：決済結果を記録し、取引を完了へ。
  const marked = await markReservationPaid({
    reservationId: reservation.id,
    chargeId: outcome.chargeId,
    provider: provider.name,
    paymentIntentId: outcome.paymentIntentId,
  });
  if (!marked.ok) {
    // 課金は成立しているため、記録失敗はサーバーログに残し 500 で通知（手動突合が必要）。
    // Webhook が後追いで同じ更新を試みるので、多くの場合そちらで自動的に復旧する。
    console.error(
      "charge succeeded but DB update failed:",
      marked.error,
      outcome.chargeId,
    );
    return NextResponse.json(
      { error: "決済は成立しましたが記録に失敗しました。運営にお問い合わせください。", chargeId: outcome.chargeId },
      { status: 500 },
    );
  }

  return NextResponse.json({ chargeId: outcome.chargeId, paid: true });
}
