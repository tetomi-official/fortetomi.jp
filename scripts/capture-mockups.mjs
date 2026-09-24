// ===================================================
// モック（docs/mockups/mobile/*.dc.html）を PNG に描き出す。
//
// Issue やレビューに「完成イメージ」として貼るための画像を作る。
// ブラウザの起動は撮影スクリプト（capture-flow.mjs）と同じ helpers を使う。
//
//   node scripts/capture-mockups.mjs
//
// 出力: docs/mockups/mobile/images/*.png
// ===================================================

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "../tests/e2e/helpers.mjs";

const MOCK_DIR = path.resolve("docs/mockups/mobile");
const OUT_DIR = path.join(MOCK_DIR, "images");

/** 撮るモックと出力名。 */
const TARGETS = [
  { file: "V2Listings.dc.html", name: "v2-listings" },
  { file: "V2Mypage.dc.html", name: "v2-mypage" },
  { file: "V2Detail.dc.html", name: "v2-detail" },
  { file: "V2Footer.dc.html", name: "v2-footer" },
  { file: "V3Login.dc.html", name: "v3-login" },
  // 追加画面（HANDOFF-more-screens.md）
  { file: "V2Top.dc.html", name: "v2-top" },
  { file: "V2Sell.dc.html", name: "v2-sell" },
  { file: "V2Checkout.dc.html", name: "v2-checkout" },
  { file: "V2Legal.dc.html", name: "v2-legal" },
  { file: "V2Dashboard.dc.html", name: "v2-dashboard" },
  { file: "V2MyListings.dc.html", name: "v2-my-listings" },
  { file: "V2SentRes.dc.html", name: "v2-sent-res" },
  { file: "V2RecvRes.dc.html", name: "v2-recv-res" },
  { file: "V2Messages.dc.html", name: "v2-messages" },
  { file: "V2Support.dc.html", name: "v2-support" },
  { file: "V2Profile.dc.html", name: "v2-profile" },
];

/** モックの外枠（width:390px の div）。dc の実行環境なしでも素の HTML として描画される。 */
const FRAME = "x-dc > div";

async function capture(page, { file, name }) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(path.join(MOCK_DIR, file)).href, { waitUntil: "networkidle0" });
  // Noto Sans JP / Raleway の読み込みを待つ（待たないと游ゴシックで撮れてしまう）。
  await page.evaluate(() => document.fonts.ready);

  const frame = await page.$(FRAME);
  if (!frame) throw new Error(`${file}: 外枠（${FRAME}）が見つからない`);
  // トップ（2060px）・出品（1720px）のように1枚で全体を描いたモックもあるので、画面の高さを外枠に合わせる。
  const { height } = await frame.boundingBox();
  if (height > 844) await page.setViewport({ width: 390, height: Math.ceil(height), deviceScaleFactor: 2 });
  await frame.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  console.log(`  ${name}.png`);

  // 外枠は overflow:hidden なので、1画面に収まらない分は切れている。
  // はみ出している画面だけ、高さを伸ばした全体像も撮る。
  const full = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const hidden = el.scrollHeight - el.clientHeight; // 数十px以上あふれている画面だけ全体像を出す
    if (hidden < 24) return 0;
    el.style.height = "auto";
    el.style.overflow = "visible";
    return el.getBoundingClientRect().height;
  }, FRAME);

  if (full) {
    await page.setViewport({ width: 390, height: Math.ceil(full), deviceScaleFactor: 2 });
    const grown = await page.$(FRAME);
    await grown.screenshot({ path: path.join(OUT_DIR, `${name}-full.png`) });
    console.log(`  ${name}-full.png（1画面に収まらないぶんも含めた全体・高さ ${Math.ceil(full)}px）`);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await launch({ カメラを自動で許可: false });
  try {
    const page = await browser.newPage();
    for (const target of TARGETS) {
      console.log(target.file);
      await capture(page, target);
    }
  } finally {
    await browser.close();
  }
  console.log(`\n完了。${path.relative(process.cwd(), OUT_DIR)} を確認してください。`);
}

main().catch((e) => {
  console.error("\n描き出しに失敗しました:", e.message);
  process.exit(1);
});
