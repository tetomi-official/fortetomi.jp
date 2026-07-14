import { type NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function siteOrigin(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || request.nextUrl.origin;
}

// 復旧用アドレスに送ったリンクの着地点。トークンを検証し、
// ログインメール（auth.users.email）を復旧用アドレスへ差し替えたうえで、
// そのアドレス宛にパスワード再設定メールを送る（＝再ログイン可能にする）。
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/recover?status=invalid", request.url));
  }

  // レート制限：トークン総当たりを抑止（20回/時/IP）。未認証の着地点なので IP でキーイング。
  const rl = await checkRateLimit(`recover-confirm:${clientIp(request)}`, 20, 3600);
  if (!rl.allowed) {
    return NextResponse.redirect(new URL("/recover?status=error", request.url));
  }

  const admin = createAdminClient();
  const tokenHash = sha256(token);

  // 未消費・未期限のトークンを探す。
  const { data: row } = await admin
    .from("email_recovery_requests")
    .select("id, user_id, expires_at, consumed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) {
    return NextResponse.redirect(new URL("/recover?status=invalid", request.url));
  }

  // トークンを消費（再利用防止）。
  const { error: consumeError } = await admin
    .from("email_recovery_requests")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null);
  if (consumeError) {
    return NextResponse.redirect(new URL("/recover?status=error", request.url));
  }

  // 復旧用アドレスを取得。
  const { data: prof } = await admin
    .from("profiles_private")
    .select("recovery_email")
    .eq("id", row.user_id)
    .maybeSingle();
  const recoveryEmail = prof?.recovery_email?.trim();
  if (!recoveryEmail) {
    return NextResponse.redirect(new URL("/recover?status=error", request.url));
  }

  // ログインメールを復旧用アドレスへ差し替える（確認済みにする）。
  const { error: updateError } = await admin.auth.admin.updateUserById(row.user_id, {
    email: recoveryEmail,
    email_confirm: true,
  });
  if (updateError) {
    return NextResponse.redirect(new URL("/recover?status=error", request.url));
  }

  // 新しいログインメール宛にパスワード再設定メールを送る（パスワードを忘れていても再ログインできる）。
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(recoveryEmail, {
    redirectTo: `${siteOrigin(request)}/auth/confirm`,
  });

  return NextResponse.redirect(new URL("/recover?status=done", request.url));
}
