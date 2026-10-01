import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { PAYMENT_PROVIDER, getProvider, providerConfigError } from "@/lib/payment-provider";
import { loadStoredCustomer, saveRegisteredCard } from "@/lib/payment-provider/customers";
import type { RegisterCardPayload } from "@/lib/payment-provider/types";

// 買い手のカード登録。PB-036 Phase 1 / Phase 2（3DS必須化）。
//  - カード番号はクライアント（payjp.js / Stripe.js）がトークン化済み。ここには成果物だけ来る。
//  - 秘密鍵はサーバー専用。保存先の payment_customers は service_role 専用書き込み。
//  - 対面のQR受け渡し時は、この保存済みカードに課金する（買い手不在でも課金できるように）。
//  - 3DS の再検証など決済会社ごとの処理は lib/payment-provider の実装側に閉じている。
export const runtime = "nodejs";

export async function POST(req: Request) {
  const cfgErr = providerConfigError();
  if (cfgErr) {
    return NextResponse.json({ error: cfgErr }, { status: 500 });
  }

  // 1) 認証（買い手本人）
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  // 1.5) レート制限：カード登録の乱発を抑止（10回/10分/ユーザー）。
  const rl = await checkRateLimit(`card:${user.id}`, 10, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "操作が多すぎます。しばらくしてからお試しください。" },
      { status: 429 },
    );
  }

  // 2) 入力：決済会社ごとの成果物。provider 省略時は今の決済会社とみなす（後方互換）。
  const body = (await req.json().catch(() => null)) as {
    provider?: unknown;
    token?: unknown;
    setupIntentId?: unknown;
  } | null;

  const declared = body?.provider === "stripe" || body?.provider === "payjp"
    ? body.provider
    : PAYMENT_PROVIDER;
  if (declared !== PAYMENT_PROVIDER) {
    return NextResponse.json({ error: "決済方式が一致しません" }, { status: 400 });
  }

  let payload: RegisterCardPayload;
  if (declared === "stripe") {
    const setupIntentId = typeof body?.setupIntentId === "string" ? body.setupIntentId : "";
    if (!setupIntentId) {
      return NextResponse.json({ error: "setupIntentId が必要です" }, { status: 400 });
    }
    payload = { provider: "stripe", setupIntentId };
  } else {
    const token = typeof body?.token === "string" ? body.token : "";
    if (!token) {
      return NextResponse.json({ error: "token が必要です" }, { status: 400 });
    }
    payload = { provider: "payjp", token };
  }

  // 3) 決済会社に検証と登録を任せ、返ってきたIDだけを保存する。
  const provider = getProvider();
  const existing = await loadStoredCustomer(user.id);
  const result = await provider.registerCard({
    userId: user.id,
    userEmail: user.email ?? null,
    existing,
    payload,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const saved = await saveRegisteredCard(user.id, result.value);
  if (saved.error) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
