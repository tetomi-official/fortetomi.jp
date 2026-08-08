import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { markReservationPaid } from "@/lib/payment-provider/reconcile";

// PAY.jp Webhook 受信（PB-036 Phase 2）。
//
// 検証方式:
//  - PAY.jp は HMAC 署名ではなく、リクエストヘッダ `X-Payjp-Webhook-Token`（アカウント固有トークン）
//    を送る。これを環境変数 PAYJP_WEBHOOK_TOKEN と定数時間比較して真正性を確認する。
//    参照: https://docs.pay.jp/v1/webhook
//  - 検証失敗は 401。設定漏れ（PAYJP_WEBHOOK_TOKEN 未設定）は 500 で明示。
//
// 目的（このハンドラが実際に行う補正）:
//  - 主に「対面課金 API では PAY.jp 課金は成立したが、直後の DB 更新に失敗した」既知のエッジケース
//    （charge/route.ts の 500 分岐）を自動で突合・補正する安全網。
//  - charge が成功（paid=true）した Webhook を受け、description の `reservation:<uuid>` から予約を特定し、
//    未決済のままなら charge_id / paid_at を記録し status を「完了」にする（冪等：既決済ならスキップ）。
//  - 応答は常に速やかに 200 を返す（PAY.jp は 4xx/5xx で最大3回・3分間隔で再送する）。
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// タイミング攻撃を避けた定数時間比較。長さが違えば即 false。
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// charge の description（`reservation:<uuid>`）から予約 ID を取り出す。
function reservationIdFromDescription(description: unknown): string | null {
  if (typeof description !== "string") return null;
  const m = /^reservation:([0-9a-f-]{36})$/i.exec(description.trim());
  if (!m || !UUID_RE.test(m[1])) return null;
  return m[1];
}

type PayjpEvent = {
  type?: string;
  data?: {
    // data.object = 発生元リソース（ここでは charge）
    object?: { id?: string; paid?: boolean; description?: string };
  };
};

export async function POST(req: Request) {
  const expected = process.env.PAYJP_WEBHOOK_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "Webhook の設定が未完了です（PAYJP_WEBHOOK_TOKEN 未設定）" },
      { status: 500 },
    );
  }

  // 1) ヘッダトークンで真正性を検証
  const token = req.headers.get("x-payjp-webhook-token") ?? "";
  if (!token || !safeEqual(token, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) ボディを解析（不正 JSON でも 200 を返して再送ループを避ける）
  const event = (await req.json().catch(() => null)) as PayjpEvent | null;
  if (!event?.type) {
    return NextResponse.json({ received: true });
  }

  // 3) 課金成功イベントのみ突合対象にする（他イベントは受領のみ）
  const isChargeSuccess =
    (event.type === "charge.succeeded" || event.type === "charge.updated") &&
    event.data?.object?.paid === true;
  if (!isChargeSuccess) {
    return NextResponse.json({ received: true });
  }

  const charge = event.data!.object!;
  const chargeId = typeof charge.id === "string" ? charge.id : "";
  const reservationId = reservationIdFromDescription(charge.description);
  if (!chargeId || !reservationId) {
    return NextResponse.json({ received: true });
  }

  // 4) 予約を突合し、未決済なら補正（冪等。書き込みは reconcile.ts に集約）
  try {
    const marked = await markReservationPaid({ reservationId, chargeId });
    if (!marked.ok) {
      console.error("webhook reconcile: reservation update failed:", marked.error, chargeId);
    } else if (!marked.alreadyPaid) {
      console.info("webhook reconciled reservation from charge:", reservationId, chargeId);
    }
  } catch (e) {
    // 補正に失敗しても 200 を返す（PAY.jp の再送で次の機会に再試行される）。
    console.error("webhook reconcile error:", e);
  }

  return NextResponse.json({ received: true });
}
