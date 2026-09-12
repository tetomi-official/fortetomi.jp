import { type NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { mailButton, mailLayout, mailLinkFallbackFooter, sendMail } from "@/lib/mail";

// crypto を使うため Node ランタイムで動かす。
export const runtime = "nodejs";

// トークンの有効時間（分）。
const TOKEN_TTL_MIN = 30;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function siteOrigin(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || request.nextUrl.origin;
}

// 卒業などで大学メール（＝ログインID）が失効しロックアウトしたユーザーの救済。
//  - 未ログインで使う（パスワード再設定メールが死んだ大学メールにしか飛ばない状況の打開）。
//  - 入力された大学メールに紐づく「復旧用アドレス（recovery_email）」宛に、
//    ログインメールを復旧用アドレスへ差し替えるワンタイムリンクを送る。
//  - リンクは recovery_email にしか送らないので、大学メールを知る第三者でも
//    recovery_email を乗っ取らない限り復旧できない＝安全。
//  - アカウントの存在有無は漏らさず、常に同じ応答を返す。
export async function POST(request: NextRequest) {
  // レート制限：総当たり・列挙・メール爆撃を抑止（未認証経路なので IP キー）。
  const rl = await checkRateLimit(`recover-request:${clientIp(request)}`, 5, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "リクエストが多すぎます。しばらくしてからお試しください。" },
      { status: 429 },
    );
  }

  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    email = "";
  }

  // 入力があってもなくても常に ok を返す（アカウント存在の推測を防ぐ）。
  if (!email) return NextResponse.json({ ok: true });

  const admin = createAdminClient();

  // 大学メールから対象ユーザーと復旧用アドレス・検証状態を引く。
  const { data: prof } = await admin
    .from("profiles_private")
    .select("id, recovery_email, recovery_email_verified")
    .ilike("university_email", email)
    .maybeSingle();

  const recoveryEmail = prof?.recovery_email?.trim();
  // 該当ユーザーが無い / 復旧用アドレス未設定 / 未検証なら、何もせず ok（存在・検証状態を漏らさない）。
  // 未検証のアドレスへ送らないのは、書き間違い・他人のアドレスへ救済リンクが飛ぶ事故を防ぐため。
  if (prof?.id && recoveryEmail && prof.recovery_email_verified) {
    // ワンタイムトークンを生成し、ハッシュだけ保存する（生トークンはメールのみ）。
    const token = randomBytes(32).toString("hex");
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000).toISOString();

    const { error: insertError } = await admin
      .from("email_recovery_requests")
      .insert({ user_id: prof.id, token_hash: tokenHash, expires_at: expiresAt });

    if (!insertError) {
      const confirmUrl = `${siteOrigin(request)}/api/recover/confirm?token=${token}`;
      await sendRecoveryEmail(recoveryEmail, confirmUrl);
    }
  }

  return NextResponse.json({ ok: true });
}

// 送信そのものは lib/mail.ts に寄せてある（同じ処理が3ルートに複製されていたため）。
// ここに残すのは、このメール固有の件名と本文だけ。
async function sendRecoveryEmail(to: string, confirmUrl: string): Promise<boolean> {
  return sendMail({
    to,
    subject: "【TETOMI】ログインメールの復旧",
    html: mailLayout(
      "ログインメールの復旧",
      `      <p>大学メールでログインできなくなったアカウントの復旧リクエストを受け付けました。</p>
      <p>下のボタンから ${TOKEN_TTL_MIN} 分以内に手続きを完了すると、ログイン用メールをこの（復旧用）アドレスに切り替え、パスワード再設定のご案内をお送りします。</p>` + mailButton("ログインメールを復旧する", confirmUrl),
      mailLinkFallbackFooter(confirmUrl),
    ),
    // RESEND_API_KEY が無い開発環境では、このリンクがログに出る。
    devHint: confirmUrl,
  });
}
