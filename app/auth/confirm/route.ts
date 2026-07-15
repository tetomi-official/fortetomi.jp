import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { graduationBoundary, parseEntranceYear } from "@/lib/enrollment";
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
//  - type=signup       … 大学メールの在籍確認 → 在籍を有効化して登録完了（ログインID＝大学メール）
//  - type=email_change … 卒業前の個人メールへのログイン切替確認 → マイページへ
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

      // 卒業前のログインメール切替（大学メール → 個人メール）の確定。
      // 在籍ステータスはここでは触らない（切替≒卒業想定。在籍は valid_until の自然失効に委ねる）。
      if (type === "email_change") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        // Secure email change が ON の場合、両側の確認が済むまで new_email が残る。
        // まだ残っていれば「もう片方のリンクも開いて」と案内する。
        if (user?.new_email) {
          return redirectWithSession(request, "/mypage?email_change=await");
        }
        return redirectWithSession(request, "/mypage?email_changed=1");
      }

      // 大学メールの在籍確認完了＝登録完了。在籍期間は大学メール先頭の入学年コード
      // （例 a24…）から算出し、卒業年（入学＋4年）の4月1日まで有効にする。
      // enrollment_* はユーザー権限では書けない特権列なので service role で更新する
      //   （ユーザーセッションで更新できると、本人が在籍ステータスを自己付与できてしまう）。
      if (type === "signup") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          // セッション未確立。切り分け用に痕跡を残す（在籍は自己修復に委ねる）。
          console.error("[auth/confirm] signup confirmed but getUser returned null");
          return redirectWithSession(request, "/?welcome=1&enroll=pending");
        }
        const entranceYear = parseEntranceYear(user.email);
        if (entranceYear === null) {
          // 登録時に弾いているので通常ここには来ない。念のためログのみ。
          console.error("[auth/confirm] entrance year unparseable:", user.email, user.id);
          return redirectWithSession(request, "/?welcome=1&enroll=pending");
        }
        const admin = createAdminClient();
        const { error: enrollErr } = await admin
          .from("profiles")
          .update({
            enrollment_verified: true,
            enrollment_valid_until: graduationBoundary(entranceYear).toISOString(),
          })
          .eq("id", user.id);
        if (enrollErr) {
          // スマホではトーストを見落としやすいので痕跡を残す（signUp と同方針）。
          // ログイン自体は成立しているので、次回ロードで自己修復ルートが拾う。
          console.error("[auth/confirm] enrollment update failed:", enrollErr.message, user.id);
          return redirectWithSession(request, "/?welcome=1&enroll=pending");
        }
        return redirectWithSession(request, "/?welcome=1");
      }

      // 想定外の type はホームへ。
      return redirectWithSession(request, "/");
    }
  }

  return NextResponse.redirect(new URL("/login?error=confirm", request.url));
}
