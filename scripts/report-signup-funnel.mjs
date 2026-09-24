// ===================================================
// TETOMI: 登録の到達状況レポート（読み取り専用）
//
//   node scripts/report-signup-funnel.mjs
//
// 「登録ボタンを押した人数」と「そのうち確認メールのリンクを開いた人数」を出す。
// QR などで流入を呼びかけたあと、どこで人が止まったのかを切り分けるために使う。
//   ・登録を試みた人数が 0        → 止まったのは登録画面より手前（＝入口の問題）
//   ・試みたのに確認済みが少ない  → 止まったのは確認メール
//   ・どちらも埋まっているのに使われていない → 登録後に何もできないことが原因
//
// 認証: service role（RLS バイパス）。.env.local から読込:
//   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//
// このスクリプトは listUsers を呼ぶだけで、書き込みは一切行わない。
// ===================================================

import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(new URL("../.env.local", import.meta.url));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("[funnel] NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です（.env.local）。");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// 実際の登録者と混ざるものを分けて数える。
//   seed  : 一括投入スクリプトで作ったもの（bulk. / seed / 同一秒に大量作成された分）
//   test  : 開発者自身の検証用（メールの + 付き別名、@gmail.com などの許可ドメイン外）
const isBulkName = (email) => /^bulk\./.test(email) || /seed/i.test(email);
const isTestAlias = (email) => email.includes("+") || !email.endsWith("@g.chuo-u.ac.jp");

const jst = (d, withTime = true) =>
  d
    ? new Date(d).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        ...(withTime ? {} : { year: "numeric", month: "2-digit", day: "2-digit" }),
      })
    : "—";
const jstDay = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

const all = [];
for (let page = 1; page <= 50; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  all.push(...data.users);
  if (data.users.length < 1000) break;
}

// 同一秒に 5 件以上まとめて作られていれば、それは一括投入とみなす。
const bySecond = new Map();
for (const u of all) bySecond.set(u.created_at, (bySecond.get(u.created_at) ?? 0) + 1);
const isBulk = (u) => isBulkName(u.email ?? "") || (bySecond.get(u.created_at) ?? 0) >= 5;

const seed = all.filter(isBulk);
const test = all.filter((u) => !isBulk(u) && isTestAlias(u.email ?? ""));
const real = all.filter((u) => !isBulk(u) && !isTestAlias(u.email ?? ""));

console.log(
  `総アカウント数: ${all.length}\n` +
    `  一括投入・デモ用 : ${seed.length}\n` +
    `  開発者の検証用   : ${test.length}\n` +
    `  実際の登録者     : ${real.length}\n`,
);

console.log("=== 開発者の検証用（参考）===");
for (const u of test.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
  console.log(`${jst(u.created_at)} | ${(u.email ?? "").padEnd(32)} | ${u.email_confirmed_at ? "確認済" : "★確認メール未開封"}`);
}

console.log("\n=== 実際の登録者（登録日順）===");
if (real.length === 0) {
  console.log("（0件）");
}
for (const u of real.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))) {
  console.log(
    [
      jst(u.created_at),
      (u.email ?? "").padEnd(32),
      u.email_confirmed_at ? `確認済(${jst(u.email_confirmed_at)})` : "★確認メール未開封",
      u.last_sign_in_at ? `ログイン有(${jst(u.last_sign_in_at)})` : "★ログインなし",
    ].join(" | "),
  );
}

console.log("\n=== 日付別（日本時間・動作確認用を除く）===");
const byDay = new Map();
for (const u of real) {
  const d = jstDay(u.created_at);
  const row = byDay.get(d) ?? { tried: 0, confirmed: 0, signedIn: 0 };
  row.tried++;
  if (u.email_confirmed_at) row.confirmed++;
  if (u.last_sign_in_at) row.signedIn++;
  byDay.set(d, row);
}
console.log("日付         登録を試みた  確認メールを開いた  ログインした");
for (const [d, r] of [...byDay.entries()].sort()) {
  console.log(
    `${d}   ${String(r.tried).padStart(8)}  ${String(r.confirmed).padStart(16)}  ${String(r.signedIn).padStart(10)}`,
  );
}

const tried = real.length;
const confirmed = real.filter((u) => u.email_confirmed_at).length;
console.log("\n=== まとめ ===");
console.log(`登録を試みた人数        : ${tried} 人`);
console.log(`確認メールを開いた人数  : ${confirmed} 人`);
console.log(`確認メールで止まった人数: ${tried - confirmed} 人`);
