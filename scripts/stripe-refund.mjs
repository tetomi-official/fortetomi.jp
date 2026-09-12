// ===================================================
// 返金（運営が手で行う操作）
//
//   node --env-file=.env.local scripts/stripe-refund.mjs <予約ID> [金額]
//   node --env-file=.env.local scripts/stripe-refund.mjs <予約ID> --dry-run
//
// 管理画面をまだ持っていないため、返金は運営がこのスクリプトで行う。
// Stripe ダッシュボードから直接返金することもできるが、その場合 TETOMI 側の
// DB が「完了」のまま残るので、必ずこちらを使うこと。
//
// 何が起きるか:
//  - 買い手のカードへ返金する
//  - 出品者へ送った売上を巻き戻す（reverse_transfer）
//  - 受け取った手数料を返す（refund_application_fee）
//  - 予約を「キャンセル」に戻し、決済の記録を消す
//
// ※ 出品者の Stripe 残高が不足していると送金の巻き戻しに失敗することがある
//   （既に銀行へ入金済みの場合など）。その場合は Stripe 側でエラーになるので、
//   出品者と個別に話をつける必要がある。
// ===================================================

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Stripe = require("stripe");

const [, , reservationId, arg] = process.argv;
const dryRun = arg === "--dry-run";
const partialAmount = arg && !dryRun ? Number(arg) : null;

if (!reservationId) {
  console.error("使い方: node --env-file=.env.local scripts/stripe-refund.mjs <予約ID> [金額|--dry-run]");
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_KEY || !STRIPE_KEY) {
  console.error("環境変数が足りません（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / STRIPE_SECRET_KEY）");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_KEY);
const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const rows = await (
  await fetch(
    `${SUPABASE_URL}/rest/v1/reservations?select=id,status,price,charge_id,payment_intent_id,payment_provider,paid_at&id=eq.${reservationId}`,
    { headers },
  )
).json();

const r = rows[0];
if (!r) {
  console.error("予約が見つかりません:", reservationId);
  process.exit(1);
}
if (!r.paid_at || !r.charge_id) {
  console.error("この予約は決済されていません（返金するものがありません）");
  process.exit(1);
}
if (r.payment_provider !== "stripe") {
  console.error(`この予約の決済会社は ${r.payment_provider ?? "不明"} です。このスクリプトは Stripe 専用です。`);
  process.exit(1);
}

console.log("対象の取引:");
console.log("  予約ID  :", r.id);
console.log("  金額    :", r.price, "円");
console.log("  支払い  :", r.charge_id);
console.log("  返金額  :", partialAmount ? `${partialAmount} 円（一部）` : `${r.price} 円（全額）`);

if (dryRun) {
  console.log("\n--dry-run のため、ここで終了します（何も変更していません）。");
  process.exit(0);
}

const refund = await stripe.refunds.create({
  charge: r.charge_id,
  ...(partialAmount ? { amount: partialAmount } : {}),
  // 出品者に送った売上を巻き戻し、受け取った手数料も返す。
  // これを付けないと、返金額をプラットフォームが丸ごとかぶることになる。
  reverse_transfer: true,
  refund_application_fee: true,
});
console.log("\n返金:", refund.status, refund.id);

// 全額返金のときだけ予約を巻き戻す（一部返金は取引自体は成立しているため触らない）。
if (!partialAmount) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${r.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      status: "キャンセル",
      paid_at: null,
      charge_id: null,
      payment_intent_id: null,
      payment_status: null,
      payment_error_code: null,
    }),
  });
  console.log("予約を「キャンセル」に戻しました:", res.status);
  console.log("※ 出品（listings）は「完了」のままです。再出品するなら手で戻してください。");
}
