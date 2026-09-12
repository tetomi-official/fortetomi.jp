// キャンセルとステータスの歯止め（T20 / T21 / T26）
import { ACCOUNTS, apiAs, clickText, findByText, go, wait } from "../helpers.mjs";
import { reservation, 予約が待つ } from "../db.mjs";
import { asUser } from "../as-user.mjs";
import { 予約を置く, 出品を置く } from "../fixtures.mjs";

/** マイページの指定タブを開き、中身が描かれるまで待つ。 */
async function タブを開く(page, label) {
  await go(page, "/mypage");
  await clickText(page, ".sidebar-nav-item", label);
  // 一覧の読み込みが終わるまで待つ（固定の待ち時間だと遅い日に落ちる）。
  // 件数0のときは空の案内が出るので、そちらも待ち受ける。
  await page
    .waitForFunction(
      () => !!document.querySelector(".res-card") || !!document.querySelector(".empty-state"),
      { timeout: 15000, polling: 300 },
    )
    .catch(() => {});
  await wait(300);
}

/** キャンセル確認用の取引を1つ用意する。 */
async function 取引を用意(status) {
  const l = await 出品を置く({
    sellerEmail: ACCOUNTS.seller.email,
    title: `キャンセル確認(${status})`,
    price: 600,
    faculties: [ACCOUNTS.seller.faculty],
  });
  return 予約を置く({ listing: l, buyerEmail: ACCOUNTS.buyer.email, status });
}

export const T20 = {
  id: "T20",
  title: "決済前のキャンセル：申請中は買い手も出品者も取り下げられる",
  async run({ buyer, seller, log }) {
    // --- 買い手が取り下げる ---
    const r1 = await 取引を用意("申請中");
    await タブを開く(buyer.page, "送った購入希望");
    if (!(await findByText(buyer.page, "button", "キャンセル"))) {
      throw new Error("買い手の画面に取り下げのボタンがありません");
    }
    await clickText(buyer.page, "button", "キャンセル");
    const 取り下げ = await 予約が待つ(r1.id, (x) => x.status === "キャンセル", {
      what: "買い手の取り下げ",
    });
    log(`買い手の取り下げ → キャンセル（${取り下げ.ms}ms）`);

    // --- 出品者が断る ---
    const r2 = await 取引を用意("申請中");
    await タブを開く(seller.page, "受け取った購入希望");
    if (!(await findByText(seller.page, "button", "断る"))) {
      throw new Error("出品者の画面に断るボタンがありません");
    }
    await clickText(seller.page, "button", "断る");
    const 断る = await 予約が待つ(r2.id, (x) => x.status === "キャンセル", {
      what: "出品者の「断る」",
    });
    log(`出品者の「断る」 → キャンセル（${断る.ms}ms）`);
  },
};

export const T20b = {
  id: "T20b",
  title: "決済前のキャンセル：承認済み（受け渡し前）も取りやめられる",
  async run({ buyer, seller, log }) {
    await 取引を用意("承認済み");

    await タブを開く(buyer.page, "送った購入希望");
    const 買い手に出ている = await buyer.page.evaluate(() => {
      const card = [...document.querySelectorAll(".res-card, .reservation-card, .card")].find((c) =>
        (c.textContent ?? "").includes("キャンセル確認(承認済み)"),
      );
      if (!card) return null;
      return [...card.querySelectorAll("button, a")].map((b) => b.textContent.trim());
    });
    log(`買い手の画面に出ているボタン: ${JSON.stringify(買い手に出ている)}`);

    await タブを開く(seller.page, "受け取った購入希望");
    const 出品者に出ている = await seller.page.evaluate(() => {
      const card = [...document.querySelectorAll(".res-card, .reservation-card, .card")].find((c) =>
        (c.textContent ?? "").includes("キャンセル確認(承認済み)"),
      );
      if (!card) return null;
      return [...card.querySelectorAll("button, a")].map((b) => b.textContent.trim());
    });
    log(`出品者の画面に出ているボタン: ${JSON.stringify(出品者に出ている)}`);

    const ある = (list) => (list ?? []).some((t) => /キャンセル|取りやめ|取り消し|断る/.test(t));
    if (!ある(買い手に出ている) && !ある(出品者に出ている)) {
      throw new Error(
        "承認済み（受け渡し日が決まったあと）の取引を、画面から取りやめる手段がありません。\n" +
          "  買い手が来られなくなった・本が売れてしまった、といった場合に逃げ道が無く、\n" +
          "  受け渡しが起きないまま「承認済み」の取引が残り続けます。",
      );
    }
  },
};

export const T21 = {
  id: "T21",
  title: "キャンセルした取引のQRでは決済できない",
  needs: ["cardReady"],
  async run({ buyer, seller, log }) {
    const r = await 取引を用意("承認済み");

    // QRを出す
    const 発行 = await apiAs(buyer.page, "/api/payments/nonce", { body: { reservationId: r.id } });
    if (発行.status !== 200) throw new Error(`QRを出せません: ${発行.status} ${JSON.stringify(発行.json)}`);
    const nonce = 発行.json.nonce;

    // キャンセルにする（承認済みからのキャンセル手段が画面に無いためDB側で落とす）
    const client = await asUser(ACCOUNTS.buyer);
    const { error } = await client.from("reservations").update({ status: "キャンセル" }).eq("id", r.id);
    if (error) throw new Error(`キャンセルに失敗: ${error.message}`);

    // そのQRで決済しようとする
    const 課金 = await apiAs(seller.page, "/api/payments/charge", { body: { reservationId: r.id, nonce } });
    if (課金.status === 200) throw new Error("キャンセル済みの取引でも決済が通ってしまいました");
    log(`キャンセル後の決済は拒否された: ${課金.status} ${課金.json?.error}`);

    // ただし合言葉そのものは残っている（承認済みに戻せば有効なまま）
    const 後 = await reservation(r.id);
    if (後.payment_nonce_hash) {
      log("※ キャンセルしてもQRの合言葉（payment_nonce_hash）は消えない。期限も無いので、承認済みに戻れば古いQRがまた効く");
    }
  },
};

export const T26 = {
  id: "T26",
  title: "支払わずに「完了」にはできない",
  async run({ log }) {
    const r = await 取引を用意("承認済み");
    const client = await asUser(ACCOUNTS.buyer);

    const { error } = await client.from("reservations").update({ status: "完了" }).eq("id", r.id);
    const 後 = await reservation(r.id);
    if (後.status === "完了" && !後.paid_at) {
      throw new Error(
        "買い手が、支払わずに取引を「完了」にできてしまいます。\n" +
          "  reservations.status には CHECK 制約も遷移チェックも無く、status 列の更新権限が\n" +
          "  当事者に開いているため、どの値でも書き込めます（決済の記録は無いまま完了になる）。",
      );
    }
    log(`拒否された: ${error?.message ?? 後.status}`);
  },
};

export const T27 = {
  id: "T27",
  title: "取りやめると出品が「出品中」に戻る",
  async run({ log }) {
    // 申請中で置いてから、出品者に承認させる。
    // （下ごしらえの INSERT ではトリガーが動かないので、実際の操作と同じ経路を通す）
    const r = await 取引を用意("申請中");
    const seller = await asUser(ACCOUNTS.seller);
    const 承認 = await seller.from("reservations").update({ status: "承認済み" }).eq("id", r.id);
    if (承認.error) throw new Error(`出品者が承認できません: ${承認.error.message}`);

    const { listing } = await import("../db.mjs");
    let l = await listing(r.listing_id);
    if (l.status !== "予約済み") throw new Error(`承認しても出品が押さえられません: ${l.status}`);
    log("承認済み → 出品は予約済み");

    // 買い手が取りやめる → 出品中に戻る
    const buyer = await asUser(ACCOUNTS.buyer);
    const { error } = await buyer.from("reservations").update({ status: "キャンセル" }).eq("id", r.id);
    if (error) throw new Error(`買い手が取りやめられません: ${error.message}`);

    l = await listing(r.listing_id);
    if (l.status !== "出品中") {
      throw new Error(
        `取りやめても出品が戻りません: ${l.status}\n` +
          "  買い手は他人の出品を直接更新できないため、DBのトリガー側で戻す必要がある。",
      );
    }
    log("キャンセル → 出品は出品中に戻った");

    // 発行済みのQRの合言葉も無効になっていること
    const 後 = await reservation(r.id);
    if (後.payment_nonce_hash) {
      throw new Error("取りやめてもQRの合言葉が残っています（承認済みに戻すと古いQRが効いてしまう）");
    }
  },
};
