// ===================================================
// 自動E2Eの実行係。
//
//   npm run test:e2e              全部のシナリオを順に通す
//   npm run test:e2e -- T13       指定したシナリオだけ
//   npm run test:e2e -- --headed  ブラウザを見えるように開く
//   npm run test:e2e -- --keep    作ったテストデータを消さない
//
// 前提:
//   - 開発サーバーが動いていること（npm run dev）
//   - .env.development.local で NEXT_PUBLIC_RELEASE_PHASE=3 にしてあること
//   - 決済まで通すなら stripe listen を動かしておくこと
//
// シナリオは1本ずつ順番に流れ、前のシナリオが作ったもの（出品ID・予約ID）を
// state 経由で次に渡す。途中で前提が崩れたら、以降は「スキップ」として記録する。
// ===================================================

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ACCOUNTS, BASE_URL, CHROME_PATH, launch, login, openPersona, shot } from "./helpers.mjs";
import { SCENARIOS } from "./scenarios/index.mjs";
import { cleanup } from "./cleanup.mjs";

// --- 環境変数を読む（.env.local → .env.development.local の順に上書き） ---
for (const f of [".env.local", ".env.development.local"]) {
  if (existsSync(f)) process.loadEnvFile(f);
}

const args = process.argv.slice(2);
const headed = args.includes("--headed");
const keep = args.includes("--keep");
const only = args.filter((a) => /^T\d+/.test(a));
const ARTIFACTS = path.resolve("tests/e2e/artifacts");

const C = {
  ok: "\x1b[32m",
  ng: "\x1b[31m",
  warn: "\x1b[33m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  off: "\x1b[0m",
};

/** 開発サーバーが動いていて、必要な解禁フェーズになっているかを先に確かめる。 */
async function 事前確認() {
  const 困りごと = [];

  if (!existsSync(CHROME_PATH)) {
    困りごと.push(`Chrome が見つかりません: ${CHROME_PATH}（CHROME_PATH で変更できます）`);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    困りごと.push("SUPABASE_SERVICE_ROLE_KEY がありません（.env.local を確認）");
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    困りごと.push("STRIPE_SECRET_KEY がありません（.env.local を確認）");
  } else if (!process.env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
    困りごと.push("STRIPE_SECRET_KEY が本番キーです。テストキー（sk_test_）でないと実際に課金されます");
  }

  try {
    const res = await fetch(BASE_URL + "/listings", { signal: AbortSignal.timeout(15000) });
    if (!res.ok) 困りごと.push(`開発サーバーが ${res.status} を返しました: ${BASE_URL}`);
  } catch {
    困りごと.push(`開発サーバーに繋がりません: ${BASE_URL}（別のターミナルで npm run dev）`);
  }

  // 解禁フェーズはサーバーのビルドに焼き込まれるので、実際に配信されたページで見る。
  try {
    const html = await fetch(BASE_URL + "/sell").then((r) => r.text());
    if (html.includes("購入機能はまもなく公開") || html.includes("プレリリース")) {
      // 出品ページの文言だけでは確実でないため、決済APIの遮断で判定する。
      const probe = await fetch(BASE_URL + "/api/payments/status");
      if (probe.status === 404) {
        困りごと.push(
          "NEXT_PUBLIC_RELEASE_PHASE が低く、決済のAPIが遮断されています。\n" +
            "    プロジェクト直下に .env.development.local を作り NEXT_PUBLIC_RELEASE_PHASE=3 を書いて、開発サーバーを再起動してください。",
        );
      }
    }
  } catch {
    /* 上のサーバー確認で拾えているので、ここでは黙る */
  }

  return 困りごと;
}

function 見出し(s) {
  console.log(`\n${C.bold}${s}${C.off}`);
}

async function main() {
  見出し("■ 事前確認");
  const 困りごと = await 事前確認();
  if (困りごと.length) {
    for (const m of 困りごと) console.log(`  ${C.ng}✗${C.off} ${m}`);
    console.log(`\n${C.ng}前提が揃っていないので中止します。${C.off}`);
    process.exit(1);
  }
  console.log(`  ${C.ok}✓${C.off} 開発サーバー ${BASE_URL} / Chrome / Supabase / Stripe テストキー`);

  // 前回の残骸があると結果が読みにくいので、先に片付ける。
  見出し("■ 前回のテストデータを片付け");
  const 片付け前 = await cleanup({ quiet: true });
  console.log(`  ${片付け前.listings} 件の出品と ${片付け前.reservations} 件の予約を消しました`);

  await mkdir(ARTIFACTS, { recursive: true });
  const browser = await launch({ headless: !headed });

  const state = {}; // シナリオ間で受け渡す値（出品ID・予約ID・nonce など）
  const results = [];
  let seller, buyer;

  try {
    見出し("■ ログイン");
    seller = await openPersona(browser);
    buyer = await openPersona(browser);
    await login(seller.page, ACCOUNTS.seller);
    console.log(`  ${C.ok}✓${C.off} 出品者 ${ACCOUNTS.seller.name}（${ACCOUNTS.seller.email}）`);
    await login(buyer.page, ACCOUNTS.buyer);
    console.log(`  ${C.ok}✓${C.off} 買い手 ${ACCOUNTS.buyer.name}（${ACCOUNTS.buyer.email}）`);

    見出し("■ シナリオ");
    const 対象 = only.length ? SCENARIOS.filter((s) => only.includes(s.id)) : SCENARIOS;
    if (!対象.length) {
      console.log(`  ${C.warn}該当するシナリオがありません: ${only.join(", ")}${C.off}`);
    }

    for (const s of 対象) {
      const 足りない = (s.needs ?? []).filter((k) => state[k] === undefined);
      if (足りない.length) {
        results.push({ ...s, outcome: "skip", detail: `前提が揃わず: ${足りない.join(", ")}` });
        console.log(`  ${C.warn}－${C.off} ${s.id} ${s.title} ${C.dim}（スキップ: ${足りない.join(", ")}）${C.off}`);
        continue;
      }

      const メモ = [];
      const log = (m) => メモ.push(m);
      const t0 = Date.now();
      try {
        await s.run({ seller, buyer, state, log, browser, artifacts: ARTIFACTS });
        const ms = Date.now() - t0;
        if (s.expectFail) {
          // 未実装のはずが通った＝直ったということ。印を外す合図。
          results.push({ ...s, outcome: "fixed", ms, notes: メモ });
          console.log(`  ${C.ok}★${C.off} ${s.id} ${s.title} ${C.dim}（未実装のはずが通りました。期待失敗の印を外せます）${C.off}`);
        } else {
          results.push({ ...s, outcome: "pass", ms, notes: メモ });
          console.log(`  ${C.ok}✓${C.off} ${s.id} ${s.title} ${C.dim}${ms}ms${C.off}`);
        }
      } catch (e) {
        const ms = Date.now() - t0;
        const 証拠 = [];
        for (const [name, p] of [["seller", seller], ["buyer", buyer]]) {
          証拠.push(await shot(p.page, ARTIFACTS, `${s.id}-${name}`));
        }
        const outcome = s.expectFail ? "known" : "fail";
        results.push({ ...s, outcome, ms, error: e.message, notes: メモ, shots: 証拠 });
        const 色 = s.expectFail ? C.warn : C.ng;
        const 記号 = s.expectFail ? "△" : "✗";
        console.log(`  ${色}${記号}${C.off} ${s.id} ${s.title}`);
        console.log(`      ${C.dim}${e.message.split("\n").join("\n      ")}${C.off}`);
        if (s.stopOnFail && !s.expectFail) {
          console.log(`      ${C.ng}この失敗は後続の前提なので、ここで打ち切ります${C.off}`);
          break;
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  // --- 集計 ---
  const 数 = (o) => results.filter((r) => r.outcome === o).length;
  見出し("■ 結果");
  console.log(`  ${C.ok}通った${C.off}            ${数("pass")}`);
  console.log(`  ${C.warn}未実装（想定内）${C.off}  ${数("known")}`);
  console.log(`  ${C.ng}想定外の失敗${C.off}      ${数("fail")}`);
  console.log(`  ${C.ok}直っていた${C.off}        ${数("fixed")}`);
  console.log(`  ${C.dim}スキップ${C.off}          ${数("skip")}`);

  if (数("known")) {
    見出し("■ 未実装（テストが先に書いてある分。直せば緑になります）");
    for (const r of results.filter((x) => x.outcome === "known")) {
      console.log(`  ${r.id} ${r.title}`);
      console.log(`    ${C.dim}${(r.error ?? "").split("\n")[0]}${C.off}`);
    }
  }
  if (数("fail")) {
    見出し("■ 想定外の失敗（要調査）");
    for (const r of results.filter((x) => x.outcome === "fail")) {
      console.log(`  ${C.ng}${r.id} ${r.title}${C.off}`);
      console.log(`    ${r.error}`);
      for (const s of r.shots ?? []) console.log(`    ${C.dim}証拠: ${s}${C.off}`);
    }
  }

  const 報告 = path.join(ARTIFACTS, "result.json");
  await writeFile(報告, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log(`\n${C.dim}詳細: ${報告}${C.off}`);

  if (!keep) {
    見出し("■ 後片付け");
    const 後 = await cleanup({ quiet: true });
    console.log(`  ${後.listings} 件の出品と ${後.reservations} 件の予約を消しました`);
    if (後.kept.length) {
      console.log(`  ${C.warn}決済まで進んだぶんは残しました（Stripe側と食い違わないように）${C.off}`);
      for (const k of 後.kept) console.log(`    予約 ${k}`);
    }
  }

  process.exit(数("fail") ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n${C.ng}実行係が落ちました:${C.off}`, e);
  process.exit(1);
});
