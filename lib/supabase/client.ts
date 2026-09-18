import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

// ブラウザ（"use client" のコンポーネント）で使う Supabase クライアント。
// 例: ログインフォームから supabase.auth.signInWithPassword() を呼ぶ。
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
