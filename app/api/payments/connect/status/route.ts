import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_PROVIDER, providerConfigError } from "@/lib/payment-provider";
import { refreshConnectAccountStatus } from "@/lib/payment-provider/stripe-connect";

// 出品者自身の Connect 口座の状態を返す。Stripe から取り直してDBのキャッシュも更新する
// （account.updated Webhook が届く前でも、この画面を開けば最新状態が見える）。
export const runtime = "nodejs";

export async function GET() {
  if (PAYMENT_PROVIDER !== "stripe") {
    return NextResponse.json({ state: "未作成" as const });
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

  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  try {
    const status = await refreshConnectAccountStatus(secretKey, user.id);
    if (!status) {
      return NextResponse.json({ state: "未作成" as const });
    }
    return NextResponse.json(status);
  } catch (e) {
    console.error("connect status fetch failed:", e);
    return NextResponse.json({ error: "状態の取得に失敗しました" }, { status: 502 });
  }
}
