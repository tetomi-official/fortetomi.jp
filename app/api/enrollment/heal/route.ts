import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { isAllowedEmail } from "@/lib/constants";
import { graduationBoundary, isEnrollmentActive, parseEntranceYear } from "@/lib/enrollment";

export const runtime = "nodejs";

// 在籍の自己修復ルート。
//  - /auth/confirm の在籍付与が失敗して取りこぼしたユーザーを、次回ロードで救済する安全網。
//  - 付与できる条件は三重ゲート：
//      (1) Supabase がメール確認済み（email_confirmed_at）＝本物の確認リンク着地の証拠
//      (2) ログインメールが許可大学ドメイン（卒業後に個人メールへ切替済みは弾く）
//      (3) 大学メール先頭から入学年が読め、その卒業境界が未来（＝在学中）
//  - enrollment_* は service role のみ書ける特権列。ユーザーは本ルートを通さない限り自己付与不可。
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // ゲート1：メール確認済みであること（Supabase 管理フィールド。クライアントから偽装不可）。
  if (!user.email_confirmed_at) {
    return NextResponse.json({ healed: false, reason: "email_not_confirmed" });
  }

  // ゲート2：ログインメールが許可大学ドメインであること。
  if (!user.email || !isAllowedEmail(user.email)) {
    return NextResponse.json({ healed: false, reason: "not_allowed_domain" });
  }

  // ゲート3：入学年が読め、卒業境界が未来（在学中）であること。
  const entranceYear = parseEntranceYear(user.email);
  if (entranceYear === null) {
    return NextResponse.json({ healed: false, reason: "unparseable" });
  }
  const validUntil = graduationBoundary(entranceYear);
  if (!isEnrollmentActive(validUntil.toISOString())) {
    // 導出期限が過去＝卒業年を過ぎている。卒業生を自己修復で復活させない。
    return NextResponse.json({ healed: false, reason: "graduated" });
  }

  // レート制限（reverify と同水準・fail-open）。
  const rl = await checkRateLimit(`enroll-heal:${user.id}`, 10, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ healed: false, reason: "rate_limited" }, { status: 429 });
  }

  // service role key 未設定なら throw する。素通しすると 500 の HTML ボディになり
  // クライアント側で無言のまま握り潰されるので、理由を明示して JSON で返す。
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error("[enrollment/heal] admin client unavailable:", e);
    return NextResponse.json({ healed: false, reason: "admin_unavailable" }, { status: 500 });
  }

  // 既に有効なら何もしない（冪等・期限の二重書き換え防止）。
  const { data: prof, error: readErr } = await admin
    .from("profiles")
    .select("enrollment_valid_until")
    .eq("id", user.id)
    .maybeSingle();
  if (readErr) {
    console.error("[enrollment/heal] read failed:", readErr.message, user.id);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  // 行が無いのは「失効」ではなく異常（トリガ未実行・行削除など）。
  // update は 0 行でもエラーにならないので、ここで弾かないと healed:true の嘘になる。
  if (!prof) {
    console.error("[enrollment/heal] profiles row missing:", user.id);
    return NextResponse.json({ healed: false, reason: "profile_missing" }, { status: 500 });
  }
  if (isEnrollmentActive(prof.enrollment_valid_until)) {
    return NextResponse.json({ healed: false, reason: "already_active" });
  }

  // service role で在籍を付与（/auth/confirm と同一値）。
  // .select() を付けて実際に更新できた行を確認する（0 行更新はエラーにならないため、
  // これが無いと「付与していないのに healed:true」を返してしまう）。
  const { data: updated, error: updErr } = await admin
    .from("profiles")
    .update({
      enrollment_verified: true,
      enrollment_valid_until: validUntil.toISOString(),
    })
    .eq("id", user.id)
    .select("id");
  if (updErr) {
    console.error("[enrollment/heal] update failed:", updErr.message, user.id);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  if (!updated || updated.length !== 1) {
    console.error("[enrollment/heal] update matched no row:", user.id);
    return NextResponse.json({ healed: false, reason: "update_no_row" }, { status: 500 });
  }

  return NextResponse.json({ healed: true });
}
