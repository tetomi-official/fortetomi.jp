import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_EXP_COOKIE, isSessionExpired } from "@/lib/supabase/session";

// 各リクエストで Supabase のセッション Cookie を更新する（トークンの自動リフレッシュ）。
// @supabase/ssr の推奨セットアップ。
// ※ Next.js 16 で middleware → proxy にリネームされた規約。
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() を呼ぶとセッションが検証・更新される
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ログイン保持の絶対期限（tetomi_session_exp）を過ぎていたらローカルサインアウトして
  // Cookie を破棄する。@supabase/ssr がセッション Cookie を 400 日固定にするため、
  // 実効的な期限切れはこの自前ゲートで打ち切る（サーバー側で強制するので回避不可）。
  if (user && isSessionExpired(request.cookies.get(SESSION_EXP_COOKIE)?.value)) {
    await supabase.auth.signOut({ scope: "local" });
    response.cookies.set(SESSION_EXP_COOKIE, "", { path: "/", maxAge: 0 });
  }

  return response;
}

export const config = {
  matcher: [
    // 静的アセットと画像最適化を除く全パス
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
