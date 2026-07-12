import { type NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextAcademicYearBoundary } from "@/lib/enrollment";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// 大学メールに送ったリンクの着地点。トークンを検証し、在籍有効期限を更新する。
//  - 大学メールを受信できた＝在籍中の証明。失効ユーザー（卒業生）はここに来られない。
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/reverify?status=invalid", request.url));
  }

  // レート制限：トークン総当たりを抑止（20回/時/IP）。未認証の着地点なので IP でキーイング。
  const rl = await checkRateLimit(`reverify-confirm:${clientIp(request)}`, 20, 3600);
  if (!rl.allowed) {
    return NextResponse.redirect(new URL("/reverify?status=error", request.url));
  }

  const admin = createAdminClient();
  const tokenHash = sha256(token);

  // 未消費・未期限のトークンを探す。
  const { data: row } = await admin
    .from("enrollment_reverifications")
    .select("id, user_id, expires_at, consumed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (
    !row ||
    row.consumed_at ||
    new Date(row.expires_at).getTime() <= Date.now()
  ) {
    return NextResponse.redirect(new URL("/reverify?status=invalid", request.url));
  }

  // トークンを消費（再利用防止）。
  const { error: consumeError } = await admin
    .from("enrollment_reverifications")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null);
  if (consumeError) {
    return NextResponse.redirect(new URL("/reverify?status=error", request.url));
  }

  // 在籍を次の年度末まで有効化。
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      enrollment_verified: true,
      enrollment_valid_until: nextAcademicYearBoundary(new Date()).toISOString(),
    })
    .eq("id", row.user_id);
  if (updateError) {
    return NextResponse.redirect(new URL("/reverify?status=error", request.url));
  }

  return NextResponse.redirect(new URL("/reverify?status=done", request.url));
}
