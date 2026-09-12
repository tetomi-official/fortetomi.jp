// 今のDBの状態をざっと見るための道具（テストではない）。
//   node --env-file=.env.local tests/e2e/inspect.mjs
import { admin, markedListings } from "./db.mjs";

const db = admin();
const p = (label, { data, error }) =>
  console.log(`\n## ${label}\n` + (error ? `ERROR: ${error.message}` : JSON.stringify(data, null, 1)));

const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
console.log(`## auth.users: ${users?.users.length ?? 0} 人`);
console.log((users?.users ?? []).slice(0, 20).map((u) => `  - ${u.email}`).join("\n"));

p("connect_accounts", await db.from("connect_accounts").select("*"));
p("payment_customers", await db.from("payment_customers").select("user_id,provider,created_at"));
p(
  "listings（ステータス別の件数）",
  await db.rpc("count_active_listings").then((r) => r, () => ({ data: null, error: { message: "RPC無し" } })),
);
p("listings 直近", await db.from("listings").select("id,title,status,price,seller_id").order("created_at", { ascending: false }).limit(8));
p(
  "reservations 直近",
  await db.from("reservations").select("id,status,price,paid_at,payment_provider,payment_status").order("created_at", { ascending: false }).limit(10),
);
console.log(`\n## 印([E2E])の付いた出品: ${(await markedListings()).length} 件`);
