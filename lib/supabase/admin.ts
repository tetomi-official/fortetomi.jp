import { createClient } from "@supabase/supabase-js";

// Service Role を使う管理用クライアント（サーバー専用・RLS バイパス）。
// 在籍再認証のトークン表 enrollment_reverifications の読み書きや、
// profiles.enrollment_valid_until の更新など、RLS を越えた特権操作に使う。
// ※ SUPABASE_SERVICE_ROLE_KEY は絶対にクライアントへ晒さないこと（NEXT_PUBLIC_ を付けない）。
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
