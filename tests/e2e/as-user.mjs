// ===================================================
// 「その人としてDBを触る」ためのクライアント。
//
// service_role は RLS を素通りしてしまうので、権限まわりの確認には使えない。
// 本人のメールとパスワードでログインした、ふつうの anon キーのクライアントを使う。
// ===================================================

import { createClient } from "@supabase/supabase-js";

const cache = new Map();

export async function asUser({ email, password }) {
  if (cache.has(email)) return cache.get(email);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY が読めていません");

  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email} でログインできません: ${error.message}`);
  cache.set(email, client);
  return client;
}
