// ===================================================
// 出品フローの画面スクリーンショット撮影（遷移図の素材づくり）
//
//   node scripts/capture-flow.mjs
//
// 前提:
//   - 開発サーバーが起動していること（既定 http://localhost:3000、BASE_URL で変更可）
//   - NEXT_PUBLIC_RELEASE_PHASE=2（.env.development.local）で出品が解禁されていること
//   - インストール済みの Chrome を使う（CHROME_PATH で変更可）
//
// 出力: docs/screens/pc/NN-*.png, docs/screens/sp/NN-*.png
//
// PC の一周だけ実際に「出品する」を押して完了画面まで進む（＝テスト出品が1件できる）。
// スマホ版の完了画面は、同じ完了画面のままビューポートだけ狭めて撮るので、
// 出品がもう1件増えることはない。
// ===================================================

import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";
// 画面操作の部品は自動E2Eと共通（tests/e2e/helpers.mjs）。同じ処理を2か所に
// 置くと、片方だけ直して食い違う事故が起きるため1本にまとめている。
import {
  BASE_URL,
  CHROME_PATH,
  clickText,
  fillByLabel,
  wait,
  waitForText,
  waitToastGone,
} from "../tests/e2e/helpers.mjs";

const OUT_ROOT = path.resolve("docs/screens");

/** 出品写真として添付する画像（表紙・裏表紙の見立て）。 */
const PHOTOS = ["public/images/gallery-science.jpg", "public/images/book-placeholder.jpg"].map((p) =>
  path.resolve(p),
);

/** 撮影する端末サイズ。sp は Retina 相当で撮って後段で縮小する。 */
const VIEWPORTS = {
  pc: { width: 1280, height: 800, deviceScaleFactor: 1 },
  sp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/** 出品フォームに入れるサンプル値。撮影のたびに同じ絵になるよう固定する。 */
const SAMPLE = {
  title: "線形代数入門 第3版",
  subject: "線形代数学",
  author: "田中 一郎",
  publisher: "中央出版",
  isbn: "978-4-1234-5678-9",
  year: "2022",
  desc: "書き込みは第2章に少しだけあります。カバー・付属の解答冊子つき。",
  price: "1200",
  location: "Forest Gateway 3F",
  condition: "書き込み少し",
};

/** 画面全体を撮って保存する。トーストが自然に消えるのを待ち、dev 用オーバーレイは隠す。 */
async function shot(page, device, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(500); // スムーススクロールが止まるのを待つ
  // 通知トーストが自動で閉じるまで待つ（成功 3.2 秒 / エラー 7 秒）。
  await waitToastGone(page);
  // Next.js 開発サーバーのインジケータ（左下の丸いバッジ）はプロダクトのUIではないので隠す。
  await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});
  await wait(300);
  const file = path.join(OUT_ROOT, device, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ✓ ${device}/${name}.png`);
}

/** ログイン画面のデモボタンでログインする（パスワードはアプリ内の定数で、ここでは扱わない）。 */
async function loginAsDemo(page) {
  await clickText(page, ".demo-btn", "佐藤");
  await page
    .waitForFunction(() => !!document.querySelector(".nav-user-badge"), { timeout: 20000 })
    .catch(() => {
      throw new Error(
        "デモログインに失敗しました。接続先の Supabase にデモアカウント（sato@g.chuo-u.ac.jp）が用意されているか確認してください。",
      );
    });
  await wait(1200); // トーストが消えるのを待つ
}

/** STEP1 のフォームを埋める（写真2枚の添付まで）。 */
async function fillStep1(page) {
  await fillByLabel(page, "教科書タイトル", SAMPLE.title);
  await fillByLabel(page, "授業名", SAMPLE.subject);
  await fillByLabel(page, "著者名", SAMPLE.author);
  await fillByLabel(page, "出版社", SAMPLE.publisher);
  await fillByLabel(page, "ISBN", SAMPLE.isbn);
  await fillByLabel(page, "出版年", SAMPLE.year);
  await fillByLabel(page, "コメント", SAMPLE.desc);

  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) throw new Error("写真アップロードの input が見つかりません");
  await fileInput.uploadFile(...PHOTOS);
  await page.waitForFunction(() => document.querySelectorAll(".preview-thumb").length >= 2, {
    timeout: 10000,
  });
  await wait(500);
}

/** STEP2（状態・価格）を埋める。 */
async function fillStep2(page) {
  await clickText(page, ".condition-opt", SAMPLE.condition);
  await fillByLabel(page, "価格（円）", SAMPLE.price);
  await fillByLabel(page, "受け渡し希望場所", SAMPLE.location);
  await wait(300);
}

/**
 * 1端末ぶんの撮影。
 * @param {boolean} submit true なら実際に出品を作成して完了画面まで撮る
 * @returns {Promise<import("puppeteer-core").Page|null>} 完了画面まで進んだ page（sp 用に使い回す）
 */
async function capture(browser, device, { submit }) {
  console.log(`\n▼ ${device} (${VIEWPORTS[device].width}×${VIEWPORTS[device].height})`);
  const context = await browser.createBrowserContext(); // 毎回ログアウト状態から始める
  const page = await context.newPage();
  await page.setViewport(VIEWPORTS[device]);

  const go = async (p) => {
    await page.goto(BASE_URL + p, { waitUntil: "networkidle2" });
    await wait(800);
  };

  await go("/");
  await shot(page, device, "01-top-guest");

  await go("/login");
  await shot(page, device, "02-login");

  await loginAsDemo(page);
  await shot(page, device, "03-top-loggedin");

  await go("/listings");
  await shot(page, device, "04-listings");

  await go("/sell");
  await waitForText(page, "01 — 基本情報");
  // プレリリース中（RELEASE_PHASE < 2）は「次へ」が無効で先に進めない。
  const gated = await page.evaluate(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent?.includes("次へ") && b.disabled,
    ),
  );
  if (gated) {
    throw new Error(
      "出品が解禁されていません（「次へ」が無効）。プロジェクト直下に .env.development.local を作り " +
        "NEXT_PUBLIC_RELEASE_PHASE=2 を書いてから開発サーバーを再起動してください。",
    );
  }
  await shot(page, device, "05-sell-step1-empty");

  await fillStep1(page);
  await shot(page, device, "06-sell-step1-filled");

  await clickText(page, "button", "次へ");
  await waitForText(page, "03 — 状態");
  await fillStep2(page);
  await shot(page, device, "07-sell-step2");

  await clickText(page, "button", "確認へ");
  await waitForText(page, "05 — 出品内容の確認");
  await shot(page, device, "08-sell-step3-confirm");

  if (!submit) {
    console.log("  … 出品の実行はスキップ（完了画面は PC の周回で撮影済み）");
    await go("/mypage");
    await clickText(page, ".sidebar-nav-item", "出品中の教科書");
    await wait(800);
    await shot(page, device, "10-mypage-listings");
    await context.close();
    return null;
  }

  console.log("  … 出品を実行します（Storage への画像アップロード＋DB 登録）");
  await clickText(page, "button", "出品する");
  await waitForText(page, "出品が完了しました", 90000);
  await wait(1500); // トーストが消えるのを待つ
  await shot(page, device, "09-sell-done");

  // 完了画面は画面遷移ではなくクライアント状態なので、ここで幅だけ変えて
  // スマホ版も撮っておく（出品をもう1件作らずに済む）。
  for (const other of Object.keys(VIEWPORTS).filter((d) => d !== device)) {
    await page.setViewport(VIEWPORTS[other]);
    await wait(800);
    await shot(page, other, "09-sell-done");
  }
  await page.setViewport(VIEWPORTS[device]);
  await wait(500);

  await go("/mypage");
  await clickText(page, ".sidebar-nav-item", "出品中の教科書");
  await wait(800);
  await shot(page, device, "10-mypage-listings");

  await context.close();
  return null;
}

async function main() {
  for (const device of Object.keys(VIEWPORTS)) {
    await mkdir(path.join(OUT_ROOT, device), { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--hide-scrollbars", "--disable-features=IsolateOrigins,site-per-process"],
  });

  try {
    // PC の周回だけ実際に出品まで進む（完了画面はスマホ幅ぶんもここで撮る）。
    await capture(browser, "pc", { submit: true });
    await capture(browser, "sp", { submit: false });
  } finally {
    await browser.close();
  }

  console.log("\n完了。docs/screens/pc, docs/screens/sp を確認してください。");
}

main().catch((e) => {
  console.error("\n撮影に失敗しました:", e.message);
  process.exit(1);
});
