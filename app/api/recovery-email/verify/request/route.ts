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

// 復旧用アドレス（recovery_email）の検証メールを送る。
//  - ログイン中ユーザーのみ。宛先＝本人が登録した個人メール。
//  - リンクを踏めた＝そのアドレスを本人が受信できる証明。confirm 側で verified を立てる。
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  // レート制限：検証メール送信の乱発を抑止（5回/時/ユーザー）。
  const rl = await checkRateLimit(`recovery-verify:${user.id}`, 5, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "送信回数が上限に達しました。しばらくしてからお試しください。" },
      { status: 429 },
    );
  }

  const admin = createAdminClient();

  // 復旧用アドレス（送信先）と現在の検証状態を取得。PII は profiles_private 側。
  const { data: profile } = await admin
    .from("profiles_private")
    .select("recovery_email, recovery_email_verified")
    .eq("id", user.id)
    .maybeSingle();
  const recoveryEmail = profile?.recovery_email?.trim();
  if (!recoveryEmail) {
    return NextResponse.json(
      { error: "復旧用メールアドレスが登録されていません" },
      { status: 400 },
    );
  }
  // 既に検証済みなら送らない（無駄なメール・混乱を防ぐ）。
  if (profile?.recovery_email_verified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  // レート制限：直近の発行から一定時間は再送しない。
  const { data: recent } = await admin
    .from("recovery_email_verifications")
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
    .from("recovery_email_verifications")
    .insert({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt });
  if (insertError) {
    return NextResponse.json(
      { error: "検証の準備に失敗しました。時間をおいてお試しください。" },
      { status: 500 },
    );
  }

  const confirmUrl = `${siteOrigin(request)}/api/recovery-email/verify/confirm?token=${token}`;
  const sent = await sendRecoveryVerifyEmail(recoveryEmail, confirmUrl);
  if (!sent) {
    return NextResponse.json(
      { error: "メール送信に失敗しました。時間をおいてお試しください。" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

// Resend API でメールを送信する（依存追加せず fetch で叩く）。
async function sendRecoveryVerifyEmail(to: string, confirmUrl: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // 開発環境で未設定のときはサーバーログにリンクを出して握りつぶす。
    console.warn("[recovery-verify] RESEND_API_KEY 未設定。検証リンク:", confirmUrl);
    return true;
  }
  const from = process.env.REVERIFY_MAIL_FROM || "TETOMI <no-reply@tetomi.jp>";
  const html = `
    <div style="font-family:sans-serif;line-height:1.8;color:#1f2937">
      <h2 style="color:#1e293b">復旧用メールアドレスの確認</h2>
      <p>TETOMI に登録された復旧用メールアドレスの確認をお願いします。</p>
      <p>下のボタンから ${TOKEN_TTL_MIN} 分以内に確認を完了すると、卒業などで大学メールが使えなくなった際に、このアドレスからアカウントを復旧できるようになります。</p>
      <p style="margin:28px 0">
        <a href="${confirmUrl}" style="background:#1e293b;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
          このメールアドレスを確認する
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
        subject: "【TETOMI】復旧用メールアドレスの確認",
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
