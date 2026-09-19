// スマホでの見え方（T37 / T38）＝手動テスト表 M-6（No.28, 29）
//
// スマホ幅（390x844・タッチ）の画面を開いて確かめる。
// 実機での持ちやすさ・QRの大きさ（No.26, 27）は人が見る。
import { ACCOUNTS, clickText, go, login, openPersona, wait, waitForText } from "../helpers.mjs";
import { admin, must, waitFor } from "../db.mjs";
import { 出品を置く } from "../fixtures.mjs";

/** スマホ幅の買い手を用意する（ふだんの買い手とは別のブラウザ文脈で、同じ人としてログイン）。 */
async function スマホの買い手(browser) {
  const p = await openPersona(browser, { device: "sp" });
  await login(p.page, ACCOUNTS.buyer);
  return p;
}

/** 購入希望の画面を開き、候補日を最大の3件まで選ぶ（いちばん縦に長くなる状態）。 */
async function 候補を3件まで入れる(page, listingId) {
  await go(page, `/listings/${listingId}`);
  await clickText(page, "button", "購入を希望する");
  await waitForText(page, "受け渡し候補日");
  const 選べる日 = await page.evaluate(
    () => [...document.querySelectorAll(".slot-row select option")].map((o) => o.value).filter(Boolean),
  );
  if (選べる日.length < 3) throw new Error(`候補日の選択肢が足りません: ${選べる日.length}件`);
  for (let i = 0; i < 3; i++) {
    if (i > 0) await clickText(page, "button", "候補を追加");
    const selects = await page.$$(".slot-row select");
    await selects[i].select(選べる日[i]);
  }
  const textarea = await page.$(".modal-reserve textarea");
  if (textarea) await textarea.type("[E2E] スマホ幅の確認", { delay: 3 });
}

/**
 * 要素までスクロールして、画面の横幅に収まり、上に何も重なっていない（押せる）かを見る。
 * 問題があれば文で返す。
 */
async function 押せるか(page, selector, 名前) {
  return page.evaluate(
    (sel, name) => {
      const el = typeof sel === "string" ? document.querySelector(sel) : null;
      if (!el) return `${name}: 画面にありません`;
      el.scrollIntoView({ block: "center", inline: "nearest" });
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return `${name}: 大きさが0（見えていない）`;
      if (r.left < -1 || r.right > window.innerWidth + 1) {
        return `${name}: 横にはみ出している（左 ${Math.round(r.left)} / 右 ${Math.round(r.right)} / 画面幅 ${window.innerWidth}）`;
      }
      if (r.top < 0 || r.bottom > window.innerHeight) {
        return `${name}: スクロールしても画面内に入りきらない（上 ${Math.round(r.top)} / 下 ${Math.round(r.bottom)} / 画面の高さ ${window.innerHeight}）`;
      }
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) {
        return `${name}: 別のものが上に重なっていて押せない（${hit?.tagName ?? "なし"}.${hit?.className ?? ""}）`;
      }
      return null;
    },
    selector,
    名前,
  );
}

/** ボタンを文言で探して、一時的な印（data-e2e）を付ける。押せるかの判定に使う。 */
async function ボタンに印(page, 文言, 印) {
  const ok = await page.evaluate(
    (t, m) => {
      const b = [...document.querySelectorAll(".modal-reserve button")].find((x) => x.textContent?.includes(t));
      if (!b) return false;
      b.setAttribute("data-e2e", m);
      return true;
    },
    文言,
    印,
  );
  if (!ok) throw new Error(`「${文言}」のボタンがありません`);
  return `[data-e2e="${印}"]`;
}

export const T37 = {
  id: "T37",
  title: "スマホ幅で、購入希望の画面がはみ出さず、候補日から送信ボタンまでたどり着ける",
  async run({ browser, log }) {
    const l = await 出品を置く({
      sellerEmail: ACCOUNTS.seller.email,
      title: "スマホ幅の確認",
      price: 800,
      faculties: [ACCOUNTS.buyer.faculty],
    });
    const p = await スマホの買い手(browser);
    try {
      const page = p.page;
      await 候補を3件まで入れる(page, l.id);
      const 問題 = [];

      // ページ全体が横にスクロールしてしまわないか
      const 横 = await page.evaluate(() => ({ 中身: document.documentElement.scrollWidth, 画面: window.innerWidth }));
      if (横.中身 > 横.画面 + 1) 問題.push(`ページが横にはみ出している（中身 ${横.中身}px / 画面 ${横.画面}px）`);

      // 入力の画面：候補日3件・場所・メッセージ・「確認へ進む」
      const 候補の数 = await page.$$eval(".slot-row select", (xs) => xs.length);
      for (let i = 0; i < 候補の数; i++) {
        問題.push(await 押せるか(page, `.slot-row:nth-of-type(${i + 1}) select`, `候補日${i + 1}`));
      }
      問題.push(await 押せるか(page, ".modal-reserve input[type=text]", "希望場所"));
      問題.push(await 押せるか(page, ".modal-reserve textarea", "メッセージ"));
      問題.push(await 押せるか(page, await ボタンに印(page, "確認へ進む", "next"), "「確認へ進む」"));
      問題.push(await 押せるか(page, ".modal-reserve .modal-close", "閉じるボタン"));

      // 確認の画面：「購入希望を送る」
      await clickText(page, ".modal-reserve button", "確認へ進む");
      await waitForText(page, "以下の内容で送信します");
      問題.push(await 押せるか(page, await ボタンに印(page, "購入希望を送る", "send"), "「購入希望を送る」"));

      const 見つかった = 問題.filter(Boolean);
      if (見つかった.length) throw new Error(見つかった.join("\n"));
      log(`スマホ幅（${横.画面}px）で、候補日${候補の数}件・場所・メッセージ・「確認へ進む」「購入希望を送る」まで押せる`);
    } finally {
      await p.context.close().catch(() => {});
    }
  },
};

export const T38 = {
  id: "T38",
  title: "電波が弱いときに「購入希望を送る」を続けて押しても、1件しか送られない",
  async run({ browser, log }) {
    const l = await 出品を置く({
      sellerEmail: ACCOUNTS.seller.email,
      title: "二度押しの確認",
      price: 800,
      faculties: [ACCOUNTS.buyer.faculty],
    });
    const p = await スマホの買い手(browser);
    const page = p.page;
    const cdp = await page.createCDPSession();
    try {
      await 候補を3件まで入れる(page, l.id);
      await clickText(page, ".modal-reserve button", "確認へ進む");
      await waitForText(page, "以下の内容で送信します");
      const 送る = await ボタンに印(page, "購入希望を送る", "send");

      // 電波が弱い状態（往復2.5秒・細い回線）にする
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 2500,
        downloadThroughput: 50 * 1024,
        uploadThroughput: 50 * 1024,
      });

      // 指で続けて2回たたく（人の二度押しくらいの間隔）
      const btn = await page.$(送る);
      await btn.tap();
      await wait(150);
      const 押した直後 = await page.evaluate((sel) => {
        const b = document.querySelector(sel);
        return { 無効: b?.disabled ?? null, 文言: b?.textContent?.trim() ?? null };
      }, 送る);
      await btn.tap().catch(() => {}); // 無効になっていれば何も起きない
      await wait(150);
      await btn.tap().catch(() => {});

      if (!押した直後.無効) throw new Error(`押した直後にボタンが無効になっていません（文言: ${押した直後.文言}）`);
      log(`押した直後: ボタンは無効・文言「${押した直後.文言}」`);

      // 送信が終わるまで待ち、できた購入希望が1件だけか
      await waitFor(
        async () => {
          const rows = await must(admin().from("reservations").select("id").eq("listing_id", l.id), "reservations");
          return rows.length ? rows : null;
        },
        { timeout: 30000, interval: 500, what: "購入希望の作成" },
      );
      await wait(4000); // 遅れて届く2通目が無いか、少し待ってから数える
      const rows = await must(admin().from("reservations").select("id").eq("listing_id", l.id), "reservations");
      if (rows.length !== 1) throw new Error(`購入希望が ${rows.length} 件できている（1件のはず）`);
      log("3回たたいても、できた購入希望は1件だけ");
    } finally {
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      }).catch(() => {});
      await p.context.close().catch(() => {});
    }
  },
};
