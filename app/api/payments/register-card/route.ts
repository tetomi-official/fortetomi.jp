import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

// 買い手のカード登録（PAY.jp Customer 作成 / カード追加）。PB-036 Phase 1 / Phase 2（3DS必須化）。
//  - カード番号はクライアントの payjp.js がトークン化済み。ここには token だけ来る。
//  - 秘密鍵はサーバー専用。payjp_customer_id は payment_customers（service_role 専用書き込み）に保存。
//  - 対面のQR受け渡し時は、この保存済みカードに課金する（買い手不在でも課金できるように）。
//  - 3DS: クライアントで 3DS 認証済みのトークンだけを受け付ける。サーバーでも token の
//    three_d_secure_status を PAY.jp から取得して再検証し、未認証トークンでの登録を拒否する
//    （クライアント検証は迂回されうるため）。PAYJP_3DS_REQUIRED=false で明示的に無効化可能（開発用）。
export const runtime = "nodejs";

const PAYJP_BASE = "https://api.pay.jp/v1";

function basicAuth(secret: string): string {
  return `Basic ${Buffer.from(`${secret}:`).toString("base64")}`;
}

// PAY.jp のトークンを取得し 3DS 認証済みかを検証する。
// verified / attempted を成功とみなす（PAY.jp 指針に準拠）。
async function verifyToken3ds(
  token: string,
  auth: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (process.env.PAYJP_3DS_REQUIRED === "false") return { ok: true };
  try {
    const res = await fetch(`${PAYJP_BASE}/tokens/${encodeURIComponent(token)}`, {
      headers: { Authorization: auth },
    });
    const data = (await res.json().catch(() => null)) as
      | { card?: { three_d_secure_status?: string }; error?: { message?: string } }
      | null;
    if (!res.ok || !data) {
      return { ok: false, error: data?.error?.message ?? "カードの確認に失敗しました", status: 402 };
    }
    const status = data.card?.three_d_secure_status;
    if (status !== "verified" && status !== "attempted") {
      return {
        ok: false,
        error: "3Dセキュア認証が完了していません。カード登録をやり直してください。",
        status: 402,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "カードの確認に失敗しました", status: 502 };
  }
}

export async function POST(req: Request) {
  const secretKey = process.env.PAYJP_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { error: "決済の設定が未完了です（PAYJP_SECRET_KEY 未設定）" },
      { status: 500 },
    );
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

  // 2) 入力（token のみ）
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) {
    return NextResponse.json({ error: "token が必要です" }, { status: 400 });
  }

  const auth = basicAuth(secretKey);
  const admin = createAdminClient();

  // 2.5) 3DS 検証：3DS 認証済みトークンでなければカード登録を拒否する。
  const tds = await verifyToken3ds(token, auth);
  if (!tds.ok) {
    return NextResponse.json({ error: tds.error }, { status: tds.status });
  }

  // 3) 既存の Customer を確認（あればカード追加、なければ新規作成）
  const { data: existing } = await admin
    .from("payment_customers")
    .select("payjp_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  try {
    if (existing?.payjp_customer_id) {
      const cus = existing.payjp_customer_id;
      // カードを追加し、既定カードに設定する。
      const cardRes = await fetch(`${PAYJP_BASE}/customers/${cus}/cards`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ card: token }),
      });
      const card = (await cardRes.json().catch(() => null)) as
        | { id?: string; error?: { message?: string } }
        | null;
      if (!cardRes.ok || !card?.id) {
        return NextResponse.json(
          { error: card?.error?.message ?? "カードの登録に失敗しました" },
          { status: 402 },
        );
      }
      await fetch(`${PAYJP_BASE}/customers/${cus}`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ default_card: card.id }),
      });
      await admin
        .from("payment_customers")
        .update({ updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      return NextResponse.json({ ok: true });
    }

    // 新規 Customer 作成（token を既定カードとして登録）
    const cusRes = await fetch(`${PAYJP_BASE}/customers`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ card: token, description: `user:${user.id}` }),
    });
    const cus = (await cusRes.json().catch(() => null)) as
      | { id?: string; error?: { message?: string } }
      | null;
    if (!cusRes.ok || !cus?.id) {
      return NextResponse.json(
        { error: cus?.error?.message ?? "カードの登録に失敗しました" },
        { status: 402 },
      );
    }

    const { error: upsertErr } = await admin
      .from("payment_customers")
      .upsert({ user_id: user.id, payjp_customer_id: cus.id, updated_at: new Date().toISOString() });
    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "通信エラーが発生しました" }, { status: 502 });
  }
}
