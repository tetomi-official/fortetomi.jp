import { createAdminClient } from "@/lib/supabase/admin";

// 自社 API のレート制限（PB-036 Phase 3）。
// カウンタは Supabase の rate_limits 表 + check_rate_limit 関数（原子的）。
// 詳細は docs/supabase-migration-12-rate-limits.sql / docs/security-measures.md。
//
// 方針:
//  - DB エラー時は fail-open（許可）＋ console.error。レート制限ストアの障害で
//    正規ユーザーを締め出さない（可用性優先）。
//  - キー（bucket）は呼び出し側で決める。認証済み API は user.id 主体、
//    未認証寄りの経路は IP を混ぜる。

// リクエストから接続元 IP を推定する（Vercel は x-forwarded-for を付ける）。
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// bucket を1回分消費し、上限以内なら allowed=true を返す。
export async function checkRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("rate limit check failed (fail-open):", error.message, bucket);
      return { allowed: true };
    }
    return { allowed: data === true };
  } catch (e) {
    console.error("rate limit check threw (fail-open):", e);
    return { allowed: true };
  }
}
