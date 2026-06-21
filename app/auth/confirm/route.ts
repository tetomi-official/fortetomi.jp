import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 確認メールのリンクを受けてセッション/メール変更を確定する。
//  - type=signup       … 大学メールの在籍確認 → 個人メール登録へ誘導
//  - type=email_change … 個人メールへの切替確認 → 登録完了
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) {
      if (type === "email_change") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("pending_personal_email")
            .eq("id", user.id)
            .maybeSingle();
          const pending = prof?.pending_personal_email?.toLowerCase() ?? null;
          const current = user.email?.toLowerCase() ?? null;

          // メールが実際に個人メールへ切り替わったときだけ「完了」とする。
          // （Secure email change が ON だと片側確認だけでは切り替わらないため、
          //   ここで早合点して pending を消すと復旧不能になる＝以前のバグ）
          if (!pending || current === pending) {
            await supabase
              .from("profiles")
              .update({ enrollment_verified: true, pending_personal_email: null })
              .eq("id", user.id);
            return NextResponse.redirect(new URL("/?welcome=1", request.url));
          }
          // まだ切り替わっていない → 残りの確認を促す画面へ
          return NextResponse.redirect(
            new URL("/signup/complete?await=1", request.url),
          );
        }
      }
      // signup（大学メール）確認後 → 個人メール登録ステップへ
      return NextResponse.redirect(new URL("/signup/complete", request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=confirm", request.url));
}
