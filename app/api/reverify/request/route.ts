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

// 送信そのものは lib/mail.ts に寄せてある（同じ処理が3ルートに複製されていたため）。
// ここに残すのは、このメール固有の件名と本文だけ。
async function sendReverifyEmail(to: string, confirmUrl: string): Promise<boolean> {
  return sendMail({
    to,
    subject: "【TETOMI】在籍確認（再認証）のお願い",
    html: mailLayout(
      "在籍確認（再認証）",
      `      <p>新年度の在籍確認のため、大学メールアドレスの再認証をお願いします。</p>
      <p>下のボタンから ${TOKEN_TTL_MIN} 分以内に再認証を完了してください。</p>` + mailButton("在籍を再認証する", confirmUrl),
      mailLinkFallbackFooter(confirmUrl),
    ),
    // RESEND_API_KEY が無い開発環境では、このリンクがログに出る。
    devHint: confirmUrl,
  });
}
