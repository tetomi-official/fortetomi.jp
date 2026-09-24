import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { PAYMENT_PROVIDER, providerConfigError } from "@/lib/payment-provider";
import { createOnboardingLink, ensureConnectAccount } from "@/lib/payment-provider/stripe-connect";

// 出品者の Stripe Connect（Express アカウント）作成＋最初のオンボーディングリンク発行。
// 既にアカウントがあれば作らず、リンクだけ新規発行する（再訪時もこのルートで良い）。
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

  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  const displayName =
    typeof user.user_metadata?.name === "string" ? user.user_metadata.name : null;
  try {
    const accountId = await ensureConnectAccount(
      secretKey,
      user.id,
      user.email ?? null,
      displayName,
    );
    const onboardingUrl = await createOnboardingLink(secretKey, accountId);
    return NextResponse.json({ onboardingUrl });
  } catch (e) {
    console.error("connect account creation failed:", e);
    return NextResponse.json({ error: "口座登録の準備に失敗しました" }, { status: 502 });
  }
}
