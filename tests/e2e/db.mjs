// ===================================================
// テストからDBを直接のぞくための入口。
//
// 画面の表示だけでは「手数料が正しく引かれたか」「出品のステータスが
// 変わったか」が分からないので、service_role で実データを読む。
// 読むのが主で、書くのは後始末（cleanup.mjs）だけに限る。
// ===================================================

import { createClient } from "@supabase/supabase-js";

/** テストが作ったデータに付ける印。後始末はこの印を目印に消す。 */
export const E2E_MARK = "[E2E]";

let cached = null;

/** service_role の Supabase クライアント（RLS を通さずに読む）。 */
export function admin() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が読めていません（.env.local を確認）",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** 問い合わせて、失敗したらその場で止める（テストの途中で黙って空配列が返るのを防ぐ）。 */
export async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`DB読み取りに失敗（${what}）: ${error.message}`);
  return data;
}

/** メールアドレスからユーザーIDを引く。 */
export async function userIdByEmail(email) {
  // profiles にメールは無いため auth.users を引く。1ページ目に収まる規模を前提とする。
  const { data, error } = await admin().auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`ユーザー一覧の取得に失敗: ${error.message}`);
  const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!found) throw new Error(`ユーザーが見つかりません: ${email}（シードが入っているか確認）`);
  return found.id;
}

/** 予約を1件取る。 */
export async function reservation(id) {
  const rows = await must(admin().from("reservations").select("*").eq("id", id), "reservations");
  if (!rows.length) throw new Error(`予約が見つかりません: ${id}`);
  return rows[0];
}

/** 出品を1件取る。 */
export async function listing(id) {
  const rows = await must(admin().from("listings").select("*").eq("id", id), "listings");
  if (!rows.length) throw new Error(`出品が見つかりません: ${id}`);
  return rows[0];
}

/** 出品者の Connect アカウントの状態。 */
export async function connectAccount(userId) {
  const rows = await must(
    admin().from("connect_accounts").select("*").eq("user_id", userId),
    "connect_accounts",
  );
  return rows[0] ?? null;
}

/** 印の付いた出品（後始末と、前回の残骸の検出に使う）。 */
export async function markedListings() {
  return must(
    admin().from("listings").select("id,title,status,seller_id,image_urls").like("title", `${E2E_MARK}%`),
    "listings(印付き)",
  );
}

/** 条件が満たされるまで待つ（Webhook の到着など、すぐには反映されないもの向け）。 */
export async function waitFor(fn, { timeout = 15000, interval = 500, what = "条件" } = {}) {
  const limit = Date.now() + timeout;
  let last;
  for (;;) {
    last = await fn();
    if (last) return last;
    if (Date.now() > limit) throw new Error(`${what}が ${timeout}ms 以内に成立しませんでした`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

/**
 * 予約が期待した状態になるまで待つ。
 *
 * 画面の操作 → サーバー → DB という順で伝わるため、クリック直後には
 * まだ変わっていない。固定の待ち時間で見ると、その日の速さ次第で落ちる
 * （実際 T07 がそれで落ちた）。**結果が出るまで見に行く**形にする。
 *
 * @param 条件 予約の行を受け取って、期待どおりなら true を返す関数
 * @returns 条件を満たした時点の行と、かかった時間
 */
export async function 予約が待つ(id, 条件, { timeout = 20000, what = "予約の更新" } = {}) {
  const t0 = Date.now();
  let 最後 = null;
  const row = await waitFor(
    async () => {
      最後 = await reservation(id);
      return 条件(最後) ? 最後 : null;
    },
    { timeout, interval: 300, what },
  ).catch(() => null);
  if (!row) {
    const e = new Error(
      `${what}が ${timeout}ms 以内に起きませんでした（いまの状態: ${最後?.status ?? "不明"}）`,
    );
    e.last = 最後;
    throw e;
  }
  return { row, ms: Date.now() - t0 };
}
