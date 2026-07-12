import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextAcademicYearBoundary } from "@/lib/enrollment";
import { SESSION_EXP_COOKIE, SHORT_DURATION_MS } from "@/lib/supabase/session";

// verifyOtp で張ったセッションが、ログイン保持ゲート（PB-011: proxy/AuthProvider）に
// 「exp Cookie 無し＝失効」と判定され即ログアウトされるのを防ぐ。
// signup/email_change/recovery の成功リダイレクトに 24h の期限 Cookie を付与する。
function redirectWithSession(request: NextRequest, path: string): NextResponse {
  const res = NextResponse.redirect(new URL(path, request.url));
  res.cookies.set(SESSION_EXP_COOKIE, String(Date.now() + SHORT_DURATION_MS), {
    path: "/",
    maxAge: Math.floor(SHORT_DURATION_MS / 1000),
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  return res;
}

// 確認メールのリンクを受けてセッション/メール変更を確定する。
//  - type=signup       … 大学メールの在籍確認 → 個人メール登録へ誘導
//  - type=email_change … 個人メールへの切替確認 → 登録完了
//  - type=recovery     … パスワード再設定（PB-012）→ 新パスワード入力ページへ
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) {
      // パスワード再設定：verifyOtp で回復セッションが張られた状態で新パスワード入力へ。
      if (type === "recovery") {
        return redirectWithSession(request, "/reset-password");
      }
      if (type === "email_change") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: prof } = await supabase
            .from("profiles_private")
            .select("pending_personal_email")
            .eq("id", user.id)
            .maybeSingle();
          const pending = prof?.pending_personal_email?.toLowerCase() ?? null;
          const current = user.email?.toLowerCase() ?? null;

          // メールが実際に個人メールへ切り替わったときだけ「完了」とする。
          // （Secure email change が ON だと片側確認だけでは切り替わらないため、
          //   ここで早合点して pending を消すと復旧不能になる＝以前のバグ）
          if (!pending || current === pending) {
            // 登録完了＝在籍確認済み。次の年度末まで在籍を有効にする。
            // enrollment_* はユーザー権限では書けない特権列なので service role で更新する
            //   （ユーザーセッションで更新できると、本人が在籍ステータスを自己付与できてしまう）。
            const admin = createAdminClient();
            // 在籍ステータス（特権列）は profiles、pending_personal_email は profiles_private。
            await admin
              .from("profiles")
              .update({
                enrollment_verified: true,
                enrollment_valid_until: nextAcademicYearBoundary(
                  new Date(),
                ).toISOString(),
              })
              .eq("id", user.id);
            await admin
              .from("profiles_private")
              .update({ pending_personal_email: null })
              .eq("id", user.id);
            return redirectWithSession(request, "/?welcome=1");
          }
          // まだ切り替わっていない → 残りの確認を促す画面へ
          return redirectWithSession(request, "/signup/complete?await=1");
        }
      }
      // signup（大学メール）確認後 → 個人メール登録ステップへ
      return redirectWithSession(request, "/signup/complete");
    }
  }

  return NextResponse.redirect(new URL("/login?error=confirm", request.url));
}
