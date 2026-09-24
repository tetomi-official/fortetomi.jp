// カメラでQRを読み取って決済（T30 / T31）＝手動テスト表 M-1
//
// 出品者のブラウザだけ、偽のカメラに「買い手の画面に出ているQR」を映して起動する。
// 読み取り画面（BarcodeScanner）・決済・両方の画面の切り替わりを、本物と同じ道筋で通す。
// 明るさ・手ぶれ・実機のカメラは見られないので、そこは手動テストに残す。
import path from "node:path";
import { ACCOUNTS, BASE_URL, clickText, go, hasText, launch, login, openPersona, shot, wait, waitForText } from "../helpers.mjs";
import { reservation, waitFor } from "../db.mjs";
import { 予約を置く, 出品を置く } from "../fixtures.mjs";
import { QR画面を開いて合言葉を取る } from "./05-payment.mjs";
import { y4mを書く, 画面のQRを写し取る } from "../fake-camera.mjs";

/** 出品者のマイページで「受け取った購入希望」を開き、読み取りボタンが出るまで待つ。 */
async function 読み取りボタンまで開く(page) {
  await go(page, "/mypage");
  await clickText(page, ".sidebar-nav-item", "受け取った購入希望");
  await page
    .waitForFunction(
      () => [...document.querySelectorAll("button")].some((b) => b.textContent?.includes("QRを読み取って決済")),
      { timeout: 15000, polling: 300 },
    )
    .catch(() => {
      throw new Error("出品者の画面に「QRを読み取って決済」のボタンが出ません");
    });
}

/** 承認済み・未決済の取引を1つ用意する。 */
async function 取引を用意(title) {
  const l = await 出品を置く({
    sellerEmail: ACCOUNTS.seller.email,
    title,
    price: 1000,
    faculties: [ACCOUNTS.buyer.faculty],
  });
  return 予約を置く({ listing: l, buyerEmail: ACCOUNTS.buyer.email, status: "承認済み" });
}

export const T30 = {
  id: "T30",
  title: "カメラでQRを読み取ると決済され、出品者と買い手の両方の画面で完了が分かる（買い手は自動で切り替わる）",
  needs: ["cardReady"],
  async run({ buyer, artifacts, log }) {
    const r = await 取引を用意("QR読み取りの確認");

    // --- 買い手：受け渡し用QRを出す。その絵を偽のカメラの動画にする ---
    await QR画面を開いて合言葉を取る(buyer.page, r.id);
    await buyer.page.waitForFunction(() => !!document.querySelector(".form-card svg"), { timeout: 10000 });
    const 動画 = path.join(artifacts, "fake-camera-qr.y4m");
    await y4mを書く(動画, await 画面のQRを写し取る(buyer.page));
    log("買い手の画面のQRを、偽のカメラの動画にした");

    // --- 出品者：偽のカメラ付きのブラウザで読み取る ---
    const browser = await launch({ args: [`--use-file-for-fake-video-capture=${動画}`] });
    try {
      const seller = await openPersona(browser);
      await login(seller.page, ACCOUNTS.seller);
      await 読み取りボタンまで開く(seller.page);

      const 開始 = Date.now();
      await clickText(seller.page, "button", "QRを読み取って決済");
      await waitForText(seller.page, "決済が完了しました", 45000).catch(async () => {
        const 証拠 = await shot(seller.page, artifacts, "T30-scanner");
        const 読み取り画面 = await seller.page.evaluate(() => document.querySelector(".modal")?.innerText ?? "（読み取り画面は閉じている）");
        throw new Error(`出品者の画面に決済完了が出ません。読み取り画面: ${読み取り画面}\n  証拠: ${証拠}`);
      });
      const 出品者側 = Date.now() - 開始;
      log(`出品者：ボタンを押してから「決済が完了しました」まで ${(出品者側 / 1000).toFixed(1)} 秒`);

      // --- 買い手：再読み込みしなくても「決済が完了しています」に切り替わるか ---
      await waitForText(buyer.page, "決済が完了しています", 20000).catch(() => {
        throw new Error("買い手の画面が自動で「決済が完了しています」に切り替わりません（20秒待機）");
      });
      const 買い手側 = Date.now() - 開始;
      log(`買い手：同じく「決済が完了しています」に自動で切り替わるまで ${(買い手側 / 1000).toFixed(1)} 秒`);

      // --- DB でも完了になっているか ---
      const 後 = await waitFor(
        async () => {
          const x = await reservation(r.id);
          return x.paid_at ? x : null;
        },
        { timeout: 15000, what: "決済済みの記録" },
      );
      if (後.status !== "完了") throw new Error(`決済後のステータスが「完了」ではありません: ${後.status}`);
      log(`記録も完了: ${後.charge_id}`);
    } finally {
      await browser.close().catch(() => {});
    }
  },
};

export const T31 = {
  id: "T31",
  title: "カメラの使用を断ったとき、何が起きたか分かる日本語の文言が出る",
  async run({ log }) {
    await 取引を用意("カメラ拒否の確認");

    const browser = await launch({ カメラを自動で許可: false });
    try {
      const seller = await openPersona(browser);
      // このブラウザではカメラを「許可しない」にしておく（利用者が拒否したのと同じ状態）
      const cdp = await browser.target().createCDPSession();
      await cdp.send("Browser.setPermission", {
        permission: { name: "camera" },
        setting: "denied",
        origin: new URL(BASE_URL).origin,
        browserContextId: seller.context.id,
      });
      await login(seller.page, ACCOUNTS.seller);
      await 読み取りボタンまで開く(seller.page);
      await clickText(seller.page, "button", "QRを読み取って決済");

      const 文 = await seller.page
        .waitForFunction(
          () => {
            const m = document.querySelector(".modal");
            const t = m?.innerText ?? "";
            return /カメラ/.test(t) && /(許可|起動)/.test(t) ? t : false;
          },
          { timeout: 15000, polling: 300 },
        )
        .then((h) => h.jsonValue())
        .catch(() => null);
      if (!文) throw new Error("カメラを断ったのに、読み取り画面に理由が出ません");
      const 本文 = 文.split("\n").map((s) => s.trim()).filter(Boolean).join(" / ");
      if (!/許可/.test(文)) throw new Error(`「許可されなかった」ことが伝わる文言になっていません: ${本文}`);
      log(`読み取り画面の表示: ${本文}`);

      // 文言が「手入力」を案内しているのに、手入力の欄が無いと利用者が迷う
      if (/手入力/.test(文)) {
        await wait(300);
        const 手入力欄 = await seller.page.evaluate(
          () => !!document.querySelector(".modal input[type=text], .modal textarea"),
        );
        if (!手入力欄 && !(await hasText(seller.page, "コードを入力"))) {
          log("※ 文言は「手入力をご利用ください」と案内しているが、決済のQRを手で入力する欄はどこにも無い");
        }
      }
    } finally {
      await browser.close().catch(() => {});
    }
  },
};
