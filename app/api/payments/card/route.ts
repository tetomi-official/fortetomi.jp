import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { PAYMENT_PROVIDER, getProvider, providerConfigError } from "@/lib/payment-provider";
import { clearRegisteredCard, loadStoredCustomer } from "@/lib/payment-provider/customers";

// マイページ「お支払い方法」の読み書き（#53）。
//
//  GET    … 登録済みカードの見え方（ブランド・下4桁・有効期限）を返す。
//  DELETE … 決済会社からカードを外し、保存済みIDを消す。
//
// カード番号そのものはここにも来ない。決済会社が持っているものを毎回問い合わせ、
// 表示に要る最小限だけを返す（DBに写しを持つと差し替え時に古い表示が残る）。
//
// 登録と差し替えは POST /api/payments/setup-intent → POST /api/payments/register-card
// をそのまま使い回す。決済会社をまたぐ実装はこれ以上増やさない。
export const runtime = "nodejs";

/** 受け渡し待ちの取引（承認済み・未決済）。カード削除の歯止めに使う。 */
async function 受け渡し待ちの件数(buyerId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("buyer_id", buyerId)
    .eq("status", "承認済み")
    .is("paid_at", null);
  return count ?? 0;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  // 設定不備でも 200 で返す（/api/payments/status と同じ考え方）。画面は
  // 「カード未登録」として描けばよく、ここで 500 を返すとマイページが開けなくなる。
  if (providerConfigError()) {
    return NextResponse.json({ provider: PAYMENT_PROVIDER, card: null, pendingHandovers: 0 });
  }

  const customer = await loadStoredCustomer(user.id);
  const [summary, pendingHandovers] = await Promise.all([
    getProvider().getCardSummary(customer),
    受け渡し待ちの件数(user.id),
  ]);
  if (!summary.ok) {
    return NextResponse.json({ error: summary.error }, { status: summary.status });
  }
  return NextResponse.json({
    provider: PAYMENT_PROVIDER,
    card: summary.value,
    pendingHandovers,
  });
}

export async function DELETE() {
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

  // カード登録と同じ枠。削除→登録の往復を乱発されないようにする。
  const rl = await checkRateLimit(`card:${user.id}`, 10, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "操作が多すぎます。しばらくしてからお試しください。" },
      { status: 429 },
    );
  }

  // 受け渡し待ちの取引があるうちは消させない。カードが無いと受け渡しQRが出ず、
  // 待ち合わせ場所で支払えなくなる。画面でもボタンを押せなくしているが、
  // 画面を回避されても効くようにここでも止める。
  const pendingHandovers = await 受け渡し待ちの件数(user.id);
  if (pendingHandovers > 0) {
    return NextResponse.json(
      {
        error:
          "受け渡し待ちの取引があるため、カードを削除できません。受け渡しを済ませるか、取引をキャンセルしてからお試しください。",
        pendingHandovers,
      },
      { status: 409 },
    );
  }

  const customer = await loadStoredCustomer(user.id);
  const removed = await getProvider().removeCard(customer);
  if (!removed.ok) {
    return NextResponse.json({ error: removed.error }, { status: removed.status });
  }

  const cleared = await clearRegisteredCard(user.id, PAYMENT_PROVIDER);
  if (cleared.error) {
    return NextResponse.json({ error: cleared.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
