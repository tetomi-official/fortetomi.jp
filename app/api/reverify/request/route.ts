import { type NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

// crypto を使うため Node ランタイムで動かす。
export const runtime = "nodejs";

// 同一ユーザーの連続送信を抑止する間隔（秒）。
const RESEND_COOLDOWN_SEC = 120;
// トークンの有効時間（分）。
const TOKEN_TTL_MIN = 30;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function siteOrigin(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || request.nextUrl.origin;
}

// 在籍再認証メールを「大学メール」宛に送る。
//  - ログイン中ユーザーのみ。
//  - 大学メールを今も受信できる＝在籍中であることの証明に使う。
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  // レート制限：再認証メール送信の乱発を抑止（5回/時/ユーザー）。既存の120秒クールダウンに上限を追加。
  const rl = await checkRateLimit(`reverify:${user.id}`, 5, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "送信回数が上限に達しました。しばらくしてからお試しください。" },
      { status: 429 },
    );
  }

  const admin = createAdminClient();

  // 大学メール（送信先）を取得。PII は profiles_private 側に分離済み。
  const { data: profile } = await admin
    .from("profiles_private")
    .select("university_email")
    .eq("id", user.id)
    .maybeSingle();
  const universityEmail = profile?.university_email?.trim();
  if (!universityEmail) {
    return NextResponse.json(
      { error: "登録された大学メールが見つかりません" },
      { status: 400 },
    );
  }

  // レート制限：直近の発行から一定時間は再送しない。
  const { data: recent } = await admin
    .from("enrollment_reverifications")
    .select("created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent?.created_at) {
    const elapsedSec = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
    if (elapsedSec < RESEND_COOLDOWN_SEC) {
      return NextResponse.json(
        { error: "メールを送信したばかりです。しばらくしてからお試しください。" },
        { status: 429 },
      );
    }
  }

  // ワンタイムトークンを生成し、ハッシュだけ保存する（生トークンはメールのみに載せる）。
  const token = randomBytes(32).toString("hex");
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000).toISOString();

  const { error: insertError } = await admin
    .from("enrollment_reverifications")
    .insert({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt });
  if (insertError) {
    return NextResponse.json(
      { error: "再認証の準備に失敗しました。時間をおいてお試しください。" },
      { status: 500 },
    );
  }

  const confirmUrl = `${siteOrigin(request)}/api/reverify/confirm?token=${token}`;
  const sent = await sendReverifyEmail(universityEmail, confirmUrl);
  if (!sent) {
    return NextResponse.json(
      { error: "メール送信に失敗しました。時間をおいてお試しください。" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

// Resend API でメールを送信する（依存追加せず fetch で叩く）。
async function sendReverifyEmail(to: string, confirmUrl: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // 開発環境で未設定のときはサーバーログにリンクを出して握りつぶす。
    console.warn("[reverify] RESEND_API_KEY 未設定。確認リンク:", confirmUrl);
    return true;
  }
  const from = process.env.REVERIFY_MAIL_FROM || "TETOMI <no-reply@tetomi.jp>";
  const html = `
    <div style="font-family:sans-serif;line-height:1.8;color:#1f2937">
      <h2 style="color:#1e293b">在籍確認（再認証）</h2>
      <p>新年度の在籍確認のため、大学メールアドレスの再認証をお願いします。</p>
      <p>下のボタンから ${TOKEN_TTL_MIN} 分以内に再認証を完了してください。</p>
      <p style="margin:28px 0">
        <a href="${confirmUrl}" style="background:#1e293b;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
          在籍を再認証する
        </a>
      </p>
      <p style="font-size:12px;color:#6b7280">
        このメールに心当たりがない場合は破棄してください。<br />
        リンクが開けない場合はこちら：<br />${confirmUrl}
      </p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "【TETOMI】在籍確認（再認証）のお願い",
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
