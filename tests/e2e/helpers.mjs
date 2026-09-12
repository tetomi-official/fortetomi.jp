// ===================================================
// ブラウザ操作の共通部品。
//
// もとは scripts/capture-flow.mjs（画面撮影）の中にあったものを、
// テストからも使えるようにここへ移した。撮影スクリプトもここを読む。
// ===================================================

import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
export const CHROME_PATH =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** シード済みのテストアカウント（docs/supabase-seed.sql、全員 password123）。 */
export const ACCOUNTS = {
  // 出品者。Stripe Connect の連携が済んでいる唯一のアカウント。
  seller: { email: "sato@g.chuo-u.ac.jp", password: "password123", name: "佐藤 花子", faculty: "経済学部" },
  // 買い手。一覧は自分の学部で絞られるので、出品者と同じ学部の人を選ぶ。
  buyer: { email: "kimura@g.chuo-u.ac.jp", password: "password123", name: "木村 颯太", faculty: "経済学部" },
  // Connect 未連携の出品者（QRが出ないことの確認に使う）。
  sellerNoConnect: { email: "suzuki@g.chuo-u.ac.jp", password: "password123", name: "鈴木 健一", faculty: "理工学部" },
};

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const VIEWPORTS = {
  pc: { width: 1280, height: 900, deviceScaleFactor: 1 },
  sp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/** Chrome を起動する。 */
export async function launch({ headless = true } = {}) {
  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless,
    args: [
      "--hide-scrollbars",
      "--disable-features=IsolateOrigins,site-per-process",
      // カメラの許可ダイアログで止まらないようにする（QR読み取り画面を開くため）。
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });
}

/**
 * 独立したブラウザ（クッキーが混ざらない）を1つ開く。
 * 出品者と買い手を同時に動かすので、必ず人ごとに分ける。
 */
export async function openPersona(browser, { device = "pc" } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(VIEWPORTS[device]);
  page.setDefaultTimeout(20000);
  // サーバーが落ちているときに沈黙しないよう、ページ側のエラーは拾っておく。
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e.message)));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  return { context, page, consoleErrors };
}

/** ページを開いて、描画が落ち着くまで待つ。 */
export async function go(page, pathname) {
  await page.goto(BASE_URL + pathname, { waitUntil: "networkidle2" });
  await wait(500);
}

/** 本文に指定の文字列が出るまで待つ。 */
export async function waitForText(page, text, timeout = 20000) {
  await page
    .waitForFunction((t) => document.body.innerText.includes(t), { timeout, polling: 300 }, text)
    .catch(() => {
      throw new Error(`画面に「${text}」が現れませんでした（${timeout}ms 待機）`);
    });
}

/** 本文にその文字列が今あるか（待たない）。 */
export async function hasText(page, text) {
  return page.evaluate((t) => document.body.innerText.includes(t), text);
}

/** 指定セレクタのうち、テキストを含む最初の要素をクリックする。 */
export async function clickText(page, selector, text) {
  const ok = await page.evaluate(
    (sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((e) => (e.textContent ?? "").includes(t));
      if (!el) return false;
      el.scrollIntoView({ block: "center" });
      el.click();
      return true;
    },
    selector,
    text,
  );
  if (!ok) throw new Error(`クリック対象が見つかりません: ${selector} 内の「${text}」`);
  await wait(600);
}

/** テキストを含む要素があるか（無くても落ちない）。 */
export async function findByText(page, selector, text) {
  return page.evaluate(
    (sel, t) => [...document.querySelectorAll(sel)].some((e) => (e.textContent ?? "").includes(t)),
    selector,
    text,
  );
}

/** label の文字列で .form-group 内の入力欄を特定して入力する。 */
export async function fillByLabel(page, label, value) {
  const handle = await page.evaluateHandle((l) => {
    const group = [...document.querySelectorAll(".form-group")].find(
      (g) => g.querySelector("label")?.textContent?.trim() === l,
    );
    return group?.querySelector("input:not([disabled]), textarea") ?? null;
  }, label);
  const el = handle.asElement();
  if (!el) throw new Error(`入力欄が見つかりません: ${label}`);
  await el.click({ clickCount: 3 });
  await el.type(value, { delay: 8 });
}

/** メールとパスワードでログインする。 */
export async function login(page, account) {
  await go(page, "/login");
  await page.type('input[type="email"]', account.email, { delay: 8 });
  await page.type('input[type="password"]', account.password, { delay: 8 });
  await clickText(page, "button", "ログイン");
  await page
    .waitForFunction(() => !!document.querySelector(".nav-user-badge"), { timeout: 20000 })
    .catch(() => {
      throw new Error(`ログインできません: ${account.email}（シードとパスワードを確認）`);
    });
  await wait(1000); // トーストが消えるのを待つ
}

/**
 * ログイン中の人としてアプリのAPIを叩く。
 * ブラウザの中から fetch するので、その人のクッキーがそのまま使われる。
 * （出品者のQR読み取りは、カメラの代わりにこれで /api/payments/charge を叩く）
 */
export async function apiAs(page, pathname, { method = "POST", body } = {}) {
  return page.evaluate(
    async (p, m, b) => {
      const res = await fetch(p, {
        method: m,
        headers: b ? { "Content-Type": "application/json" } : undefined,
        body: b ? JSON.stringify(b) : undefined,
      });
      let json = null;
      try {
        json = await res.json();
      } catch {
        /* 本文が JSON でないときは null のまま */
      }
      return { status: res.status, ok: res.ok, json };
    },
    pathname,
    method,
    body ?? null,
  );
}

/** 画面を撮って保存する（失敗時の証拠に使う）。 */
export async function shot(page, dir, name) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
}

/** トーストが消えるまで待つ（撮影用。成功3.2秒／エラー7秒で自動的に閉じる）。 */
export async function waitToastGone(page, timeout = 9000) {
  await page
    .waitForFunction(
      () => {
        const t = document.querySelector(".toast");
        return !t || t.classList.contains("hidden");
      },
      { timeout, polling: 200 },
    )
    .catch(() => {});
}
