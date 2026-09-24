import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { PAYMENT_PROVIDER, providerConfigError } from "@/lib/payment-provider";
import { loadConnectBalance } from "@/lib/payment-provider/stripe-connect";

// 出品者自身の売上残高と入金予定を Stripe から返す（issue #54）。
//
// TETOMI は売上金を預かっていないので、この数字を自前で持つことはできない。
// 予約テーブルから足し算すると、返金ぶんや入金済みぶんが引かれず、画面の数字と
// 実際の残高が食い違う。必ず Stripe を正とする。
//
// 未登録（受取口座をまだ作っていない）は異常ではないので 200 + connected:false を返す。
export const runtime = "nodejs";

export async function GET() {
  if (PAYMENT_PROVIDER !== "stripe") {
    return NextResponse.json({ connected: false as const });
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

  // この1回の表示で Stripe を最大4回叩くので、画面の再読み込み連打を抑える。
  const rl = await checkRateLimit(`connect-balance:${user.id}`, 30, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "操作が多すぎます。しばらくしてからお試しください。" },
      { status: 429 },
    );
  }

  try {
    const balance = await loadConnectBalance(process.env.STRIPE_SECRET_KEY ?? "", user.id);
    if (!balance) {
      return NextResponse.json({ connected: false as const });
    }
    return NextResponse.json({ connected: true as const, ...balance });
  } catch (e) {
    console.error("connect balance fetch failed:", e);
    return NextResponse.json({ error: "残高を取得できませんでした" }, { status: 502 });
  }
}
