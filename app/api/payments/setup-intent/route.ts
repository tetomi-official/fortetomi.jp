import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getProvider, providerConfigError } from "@/lib/payment-provider";
import { loadStoredCustomer } from "@/lib/payment-provider/customers";

// Stripe のカード登録フォームを開く前の下準備（SetupIntent の発行）。
// PAY.jp は payjp.js が公開鍵だけで動くのでこのルートを使わない
// （PaymentFormPayjp は呼ばない）。
export const runtime = "nodejs";

export async function POST() {
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

  // カード登録の下準備の乱発を抑止（register-card と同じ枠を使う）。
  const rl = await checkRateLimit(`card:${user.id}`, 10, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "操作が多すぎます。しばらくしてからお試しください。" },
      { status: 429 },
    );
  }

  const existing = await loadStoredCustomer(user.id);
  const result = await getProvider().createCardSetupSession({
    userId: user.id,
    userEmail: user.email ?? null,
    existing,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (result.value.kind !== "stripe_setup_intent") {
    return NextResponse.json({ error: "この決済方式では不要な操作です" }, { status: 400 });
  }
  return NextResponse.json({ clientSecret: result.value.clientSecret });
}
