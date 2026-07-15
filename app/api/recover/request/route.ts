import { type NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

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

// Resend API でメールを送信する（依存追加せず fetch で叩く）。
async function sendRecoveryEmail(to: string, confirmUrl: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // 開発環境で未設定のときはサーバーログにリンクを出して握りつぶす。
    console.warn("[recover] RESEND_API_KEY 未設定。復旧リンク:", confirmUrl);
    return true;
  }
  const from = process.env.REVERIFY_MAIL_FROM || "TETOMI <no-reply@tetomi.jp>";
  const html = `
    <div style="font-family:sans-serif;line-height:1.8;color:#1f2937">
      <h2 style="color:#1e293b">ログインメールの復旧</h2>
      <p>大学メールでログインできなくなったアカウントの復旧リクエストを受け付けました。</p>
      <p>下のボタンから ${TOKEN_TTL_MIN} 分以内に手続きを完了すると、ログイン用メールをこの（復旧用）アドレスに切り替え、パスワード再設定のご案内をお送りします。</p>
      <p style="margin:28px 0">
        <a href="${confirmUrl}" style="background:#1e293b;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
          ログインメールを復旧する
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
        subject: "【TETOMI】ログインメールの復旧",
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
