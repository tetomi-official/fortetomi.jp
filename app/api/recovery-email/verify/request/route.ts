import { type NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { mailButton, mailLayout, mailLinkFallbackFooter, sendMail } from "@/lib/mail";

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

// 送信そのものは lib/mail.ts に寄せてある（同じ処理が3ルートに複製されていたため）。
// ここに残すのは、このメール固有の件名と本文だけ。
async function sendRecoveryVerifyEmail(to: string, confirmUrl: string): Promise<boolean> {
  return sendMail({
    to,
    subject: "【TETOMI】復旧用メールアドレスの確認",
    html: mailLayout(
      "復旧用メールアドレスの確認",
      `      <p>TETOMI に登録された復旧用メールアドレスの確認をお願いします。</p>
      <p>下のボタンから ${TOKEN_TTL_MIN} 分以内に確認を完了すると、卒業などで大学メールが使えなくなった際に、このアドレスからアカウントを復旧できるようになります。</p>` + mailButton("このメールアドレスを確認する", confirmUrl),
      mailLinkFallbackFooter(confirmUrl),
    ),
    // RESEND_API_KEY が無い開発環境では、このリンクがログに出る。
    devHint: confirmUrl,
  });
}
