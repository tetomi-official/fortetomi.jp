import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { PAYMENT_PROVIDER, providerConfigError } from "@/lib/payment-provider";
import { createOnboardingLink, loadConnectAccountRow } from "@/lib/payment-provider/stripe-connect";

// 既存の Connect アカウント向けに、新しいオンボーディングリンクを発行する。
// AccountLink は1回きりで数分で失効するため、期限切れ・中断からの再開で使う。
export const runtime = "nodejs";

export async function POST() {
  if (PAYMENT_PROVIDER !== "stripe") {
    return NextResponse.json({ error: "この決済方式では利用できません" }, { status: 400 });
  }
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

  const rl = await checkRateLimit(`connect:${user.id}`, 10, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "操作が多すぎます。しばらくしてからお試しください。" },
      { status: 429 },
    );
  }

  const existing = await loadConnectAccountRow(user.id);
  if (!existing) {
    return NextResponse.json({ error: "先に受取口座の登録を始めてください" }, { status: 404 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  try {
    const onboardingUrl = await createOnboardingLink(secretKey, existing.stripeAccountId);
    return NextResponse.json({ onboardingUrl });
  } catch (e) {
    console.error("connect link creation failed:", e);
    return NextResponse.json({ error: "リンクの発行に失敗しました" }, { status: 502 });
  }
}
