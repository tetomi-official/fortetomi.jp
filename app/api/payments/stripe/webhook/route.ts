import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/payment-provider/stripe-client";
import {
  markReservationPaid,
  markReservationPaymentFailed,
} from "@/lib/payment-provider/reconcile";
import { syncConnectAccountFromWebhook } from "@/lib/payment-provider/stripe-connect";

// Stripe Webhook 受信。
//
// 検証方式（PAY.jp とは根本的に違う）:
//  - PAY.jp は固定トークンのヘッダ照合だったが、Stripe は「生のリクエストボディ」に
//    対する HMAC 署名（stripe-signature ヘッダ）。したがって req.json() ではなく
//    req.text() で生のまま受け取る必要がある。1文字でも変形すると検証に落ちる。
//  - 署名の解析・時刻許容（リプレイ防止）は自前で書かず SDK の constructEvent に任せる。
//    ここは間違っていても気づけない類のコードなので、手書きしない。
//
// 目的:
//  - 主に「Stripe では課金が成立したのに、直後の DB 更新に失敗した」ときの補正。
//  - あわせて出品者の口座状態（Connect）の変化を追随する。
//
// 応答方針: 署名検証の失敗だけ 400。それ以外は常に 200 を返す
// （Stripe は 2xx 以外を最大3日間再送し続けるため、こちらの都合で溜めない）。
//
// 出品者の口座状態について（stripe listen で実測して分かったこと）:
//   Accounts v2 のアカウントを更新しても、従来の account.updated は飛んでこない。
//   v2 は `v2.core.account.updated` という「薄いイベント」を別系統で出す
//   （object: "v2.core.event"、本体は related_object.id だけ持つ）。
//   これを本番で受けるには v2 のイベント宛先を別途作り、別の署名シークレットを
//   管理する必要がある。
//   一方で、口座状態が本当に効くのは「QRを出す直前」と「課金の直前」の2点だけで、
//   そこでは isSellerReadyToReceive() が Stripe に直接問い合わせている。
//   つまりキャッシュの鮮度に依存していないので、この Webhook 無しでも正しく動く。
//   薄いイベントの購読は、必要になったら足せばよい（今は増やさない）。
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 予約IDを取り出す。metadata を正とし、無ければ description から拾う
 * （description の `reservation:<uuid>` 規約は PAY.jp 時代から共通）。
 */
function reservationIdFrom(obj: {
  metadata?: Stripe.Metadata | null;
  description?: string | null;
}): string | null {
  const fromMeta = obj.metadata?.reservation_id;
  if (typeof fromMeta === "string" && UUID_RE.test(fromMeta)) return fromMeta;

  const m = /^reservation:([0-9a-f-]{36})$/i.exec((obj.description ?? "").trim());
  if (m && UUID_RE.test(m[1])) return m[1];
  return null;
}

async function handlePaymentIntentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
  const reservationId = reservationIdFrom(pi);
  // charge_id には ch_ を入れる（pi_ を入れると画面の決済済み判定が壊れる）。
  const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : null;
  if (!reservationId || !chargeId) return;

  const marked = await markReservationPaid({
    reservationId,
    chargeId,
    provider: "stripe",
    paymentIntentId: pi.id,
  });
  if (!marked.ok) {
    console.error("stripe webhook: reservation update failed:", marked.error, pi.id);
  } else if (!marked.alreadyPaid) {
    console.info("stripe webhook reconciled reservation:", reservationId, pi.id);
  }
}

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  const reservationId = reservationIdFrom(pi);
  if (!reservationId) return;

  const code = pi.last_payment_error?.code ?? null;
  await markReservationPaymentFailed({
    reservationId,
    provider: "stripe",
    paymentIntentId: pi.id,
    // 本人認証が要るだけなら、買い手はその場で復旧できる（S6）。単なる拒否とは区別する。
    status: code === "authentication_required" ? "requires_action" : "failed",
    errorCode: code,
  });
}

async function handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return;

  // チャージバックはプラットフォーム残高から引かれる。出品者への送金の
  // 巻き戻しは自動ではやらない（既に受け取っている売上を勝手に取り戻さない）。
  // 運営が気づけるよう記録とログだけ残す＝方針判断は人間が行う。
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data } = await admin
    .from("reservations")
    .select("id")
    .eq("charge_id", chargeId)
    .maybeSingle();
  if (!data) return;

  await admin
    .from("reservations")
    .update({ payment_status: "disputed", payment_error_code: dispute.reason ?? null })
    .eq("id", data.id);
  console.error("stripe webhook: dispute created", dispute.id, chargeId, data.id);
}

export async function POST(req: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    return NextResponse.json(
      { error: "Webhook の設定が未完了です（STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET）" },
      { status: 500 },
    );
  }

  // 1) 生ボディのまま署名を検証する。ここで JSON に変換してはいけない。
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "signature missing" }, { status: 400 });
  }

  const stripe = getStripeClient(secretKey);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, webhookSecret);
  } catch (e) {
    // 署名不一致・時刻のズレ（リプレイ）はここで落ちる。再送されても通らないので 400。
    console.error("stripe webhook signature verification failed:", e);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  // 2) 種類ごとの処理。想定外のイベントは受領だけして 200 を返す。
  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object);
        break;
      case "charge.dispute.created":
        await handleDisputeCreated(event.data.object);
        break;
      case "account.updated":
        // Accounts v1 のアカウント更新。TETOMI は v2 で作るのでこの経路は通常来ない
        // （stripe listen で実測。v2 は後述のとおり別系統のイベントを出す）。
        // 万一 v1 のアカウントが混ざった場合の保険として残す。
        await syncConnectAccountFromWebhook(secretKey, event.data.object.id);
        break;
      default:
        break;
    }
  } catch (e) {
    // 補正に失敗しても 200 を返す（Stripe の再送で次の機会に再試行される）。
    console.error("stripe webhook handler error:", event.type, e);
  }

  return NextResponse.json({ received: true });
}
