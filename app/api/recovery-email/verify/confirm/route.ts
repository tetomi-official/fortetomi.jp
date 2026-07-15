import { type NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// 復旧用アドレスに送ったリンクの着地点。トークンを検証し、
// recovery_email_verified を立てる（＝そのアドレスを本人が受信できると確認できた）。
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/mypage?recovery_verify=invalid", request.url));
  }

  // レート制限：トークン総当たりを抑止（20回/時/IP）。未認証の着地点なので IP でキーイング。
  const rl = await checkRateLimit(`recovery-verify-confirm:${clientIp(request)}`, 20, 3600);
  if (!rl.allowed) {
    return NextResponse.redirect(new URL("/mypage?recovery_verify=error", request.url));
  }

  const admin = createAdminClient();
  const tokenHash = sha256(token);

  // 未消費・未期限のトークンを探す。
  const { data: row } = await admin
    .from("recovery_email_verifications")
    .select("id, user_id, expires_at, consumed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) {
    return NextResponse.redirect(new URL("/mypage?recovery_verify=invalid", request.url));
  }

  // トークンを消費（再利用防止）。
  const { error: consumeError } = await admin
    .from("recovery_email_verifications")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null);
  if (consumeError) {
    return NextResponse.redirect(new URL("/mypage?recovery_verify=error", request.url));
  }

  // 復旧用アドレスを検証済みにする。
  const { error: updateError } = await admin
    .from("profiles_private")
    .update({
      recovery_email_verified: true,
      recovery_email_verified_at: new Date().toISOString(),
    })
    .eq("id", row.user_id);
  if (updateError) {
    return NextResponse.redirect(new URL("/mypage?recovery_verify=error", request.url));
  }

  return NextResponse.redirect(new URL("/mypage?recovery_verified=1", request.url));
}
