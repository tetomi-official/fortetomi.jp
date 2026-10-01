// 手元の Supabase（npm run db:start で起動したもの）につないで next dev を起動する。
//
// .env.local は本番の Supabase を向いているので、ここで接続先の3つだけを上書きする。
// Next.js は、すでにある環境変数を .env ファイルで上書きしないため、これで手元に向く。
// 決済（Stripe テストキー）やメール設定は .env.local / .env.development.local のまま。
//
// 使い方: npm run dev:local            （追加の引数は next dev に渡る。例: -- -p 3100）
import { execFileSync, spawn } from "node:child_process";

let status;
try {
  const out = execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" });
  status = JSON.parse(out.slice(out.indexOf("{")));
} catch {
  console.error("手元の Supabase が動いていません。先に `npm run db:start` を実行してください。");
  process.exit(1);
}

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};
console.log(`手元の Supabase（${status.API_URL}）につないで起動します。`);

const child = spawn("npx", ["next", "dev", ...process.argv.slice(2)], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
