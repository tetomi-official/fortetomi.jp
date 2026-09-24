import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { PAYMENT_PROVIDER, providerConfigError } from "@/lib/payment-provider";
import { getStripeClient } from "@/lib/payment-provider/stripe-client";
import { loadConnectAccountRow } from "@/lib/payment-provider/stripe-connect";

// 出品者を Stripe の管理画面（Express ダッシュボード）へ入れるための一時リンク。
// 売上の残高・入金予定・入金履歴・銀行口座の変更はすべてそちらで行う
// （TETOMI 側では売上金を預からないので、こちらに残高画面は無い）。
//
// リンクは短時間で失効する使い捨て。押されたときに毎回発行する。
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

  const rl = await checkRateLimit(`connect-login:${user.id}`, 10, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "操作が多すぎます。しばらくしてからお試しください。" },
      { status: 429 },
    );
  }

  // 自分の連結アカウントに対してのみ発行する（他人の acct_ は指定させない）。
  const account = await loadConnectAccountRow(user.id);
  if (!account) {
    return NextResponse.json({ error: "先に受取口座の登録が必要です" }, { status: 404 });
  }

  try {
    const stripe = getStripeClient(process.env.STRIPE_SECRET_KEY ?? "");
    const link = await stripe.accounts.createLoginLink(account.stripeAccountId);
    return NextResponse.json({ url: link.url });
  } catch (e) {
    console.error("failed to create login link:", e);
    return NextResponse.json({ error: "管理画面を開けませんでした" }, { status: 502 });
  }
}
