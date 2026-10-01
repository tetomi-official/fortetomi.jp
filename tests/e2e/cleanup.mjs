// ===================================================
// テストが作ったデータの後片付け。
//
//   npm run test:e2e:cleanup            何を消すか表示するだけ
//   npm run test:e2e:cleanup -- --yes   実際に消す
//
// 目印は出品タイトルの先頭の [E2E]。テストはこの印を必ず付ける。
//
// ★決済まで進んだ予約は消さない。★
//   Stripe 側には課金の記録が残るため、DBだけ消すと突き合わせができなくなる。
//   返金が必要なものは scripts/stripe-refund.mjs で処理する。
// ===================================================

import { existsSync } from "node:fs";
import { E2E_MARK, admin, markedListings, must } from "./db.mjs";

const BUCKET = "listing-images";

export async function cleanup({ quiet = false, dryRun = false } = {}) {
  const db = admin();
  const 出品 = await markedListings();
  const ids = 出品.map((l) => l.id);
  const 結果 = { listings: 0, reservations: 0, images: 0, kept: [] };

  if (!ids.length) return 結果;

  const 予約 = await must(
    db.from("reservations").select("id,paid_at,charge_id,listing_id").in("listing_id", ids),
    "reservations(印付き出品の分)",
  );

  // 決済まで進んだものは残す。その出品も一緒に残す（予約が参照しているため）。
  const 残す予約 = 予約.filter((r) => r.paid_at || r.charge_id);
  const 消す予約 = 予約.filter((r) => !r.paid_at && !r.charge_id);
  const 残す出品 = new Set(残す予約.map((r) => r.listing_id));
  const 消す出品 = 出品.filter((l) => !残す出品.has(l.id));

  結果.kept = 残す予約.map((r) => r.id);

  if (!quiet) {
    console.log(`印 ${E2E_MARK} の付いた出品: ${出品.length} 件 / ひも付く予約: ${予約.length} 件`);
    console.log(`  消す: 出品 ${消す出品.length} 件・予約 ${消す予約.length} 件`);
    console.log(`  残す: 決済済みの予約 ${残す予約.length} 件（Stripeと食い違わないため）`);
    if (dryRun) {
      for (const l of 消す出品) console.log(`   - ${l.title}`);
      return 結果;
    }
  }
  if (dryRun) return 結果;

  if (消す予約.length) {
    const { error } = await db.from("reservations").delete().in("id", 消す予約.map((r) => r.id));
    if (error) throw new Error(`予約の削除に失敗: ${error.message}`);
    結果.reservations = 消す予約.length;
  }

  // Storage に上がったテスト画像も消す（消し忘れると容量を食い続ける）。
  const 画像パス = [];
  for (const l of 消す出品) {
    for (const url of l.image_urls ?? []) {
      const m = /\/listing-images\/(.+)$/.exec(url);
      if (m) 画像パス.push(decodeURIComponent(m[1]));
    }
  }
  if (画像パス.length) {
    const { error } = await db.storage.from(BUCKET).remove(画像パス);
    if (error && !quiet) console.warn(`  画像の削除に失敗（無視して続けます）: ${error.message}`);
    else 結果.images = 画像パス.length;
  }

  if (消す出品.length) {
    const { error } = await db.from("listings").delete().in("id", 消す出品.map((l) => l.id));
    if (error) throw new Error(`出品の削除に失敗: ${error.message}`);
    結果.listings = 消す出品.length;
  }

  return 結果;
}

// 直接実行されたときだけ動く。
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const f of [".env.local", ".env.development.local"]) {
    if (existsSync(f)) process.loadEnvFile(f);
  }
  const 本当に消す = process.argv.includes("--yes");
  const r = await cleanup({ dryRun: !本当に消す });
  if (!本当に消す) console.log("\n実際に消すには --yes を付けてください。");
  else console.log(`\n消しました: 出品 ${r.listings} / 予約 ${r.reservations} / 画像 ${r.images}`);
}
