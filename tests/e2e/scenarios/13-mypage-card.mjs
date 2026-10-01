// マイページ「お支払い方法」（T40・#53）
//
// 買う瞬間しかカードを登録できず、登録後は変更も削除もできなかった。
// マイページで「登録 → 変更 → 削除」が一通りできることを、画面から確かめる。
//
// 受け渡し待ち（承認済み・未決済）の取引があるうちは削除できない。その歯止めも見る。
import { ACCOUNTS, clickText, go, waitForText } from "../helpers.mjs";
import { TEST_CARDS, カードを入力, 本人認証を通す } from "../stripe-ui.mjs";
import { admin, must, userIdByEmail, 回数制限をリセット } from "../db.mjs";
import { 予約を置く, 出品を置く } from "../fixtures.mjs";

/** payment_customers の行（無ければ null）。 */
async function 保存済みカード(userId) {
  const rows = await must(
    admin().from("payment_customers").select("*").eq("user_id", userId),
    "payment_customers",
  );
  return rows[0] ?? null;
}

export const T40 = {
  id: "T40",
  title: "マイページでカードを登録・変更・削除できる（#53）",
  async run({ buyer, log }) {
    const page = buyer.page;
    const buyerId = await userIdByEmail(ACCOUNTS.buyer.email);

    // 未登録の状態から始める（登録済みだと「登録する」ボタンが出ない）。
    await must(
      admin().from("payment_customers").delete().eq("user_id", buyerId).select("user_id"),
      "payment_customers(外す)",
    );
    await 回数制限をリセット(`card:${buyerId}`);

    // --- ① 登録 ---
    await go(page, "/mypage?tab=payment");
    await waitForText(page, "カードは未登録です", 20000);
    await clickText(page, "button", "カードを登録する");
    await waitForText(page, "支払いカードの登録", 30000);
    await カードを入力(page, { number: TEST_CARDS.ふつう });
    await clickText(page, "button", "カードを登録する");
    await 本人認証を通す(page, { timeout: 45000 });

    await waitForText(page, "4242", 45000).catch(async () => {
      const 画面 = await page.evaluate(() => document.body.innerText.slice(0, 600));
      throw new Error(`登録後に下4桁が出ません。画面の文言:\n${画面}`);
    });
    const 登録後 = await 保存済みカード(buyerId);
    if (!登録後?.stripe_payment_method_id) {
      throw new Error("マイページから登録したのに payment_customers に残っていません");
    }
    log(`登録できた（${登録後.stripe_payment_method_id}）`);

    // 下4桁と有効期限が出ているか
    const 画面 = await page.evaluate(() => document.body.innerText);
    if (!/有効期限/.test(画面)) throw new Error("有効期限が出ていません");

    // --- ② 変更（別のカードに差し替える） ---
    await 回数制限をリセット(`card:${buyerId}`);
    await clickText(page, "button", "カードを変更する");
    await waitForText(page, "支払いカードの登録", 30000);
    // 差し替えの確認が目的なので、カードはふつうのもので良い（同じ番号でも
    // 決済会社側は別の支払い方法として作る）。断られるカードの文言は T12c で見る。
    await カードを入力(page, { number: TEST_CARDS.ふつう });
    await clickText(page, "button", "このカードに変更する");
    await 本人認証を通す(page, { timeout: 45000 });
    await waitForText(page, "カードを変更しました", 45000).catch(async () => {
      const 文 = await page.evaluate(() => document.body.innerText.slice(0, 600));
      throw new Error(`カードを変更できません。画面の文言:\n${文}`);
    });

    const 変更後 = await 保存済みカード(buyerId);
    if (変更後?.stripe_payment_method_id === 登録後.stripe_payment_method_id) {
      throw new Error("カードを変更したのに保存されている支払い方法が同じままです");
    }
    log(`変更できた（${登録後.stripe_payment_method_id} → ${変更後.stripe_payment_method_id}）`);

    // 前のカードが顧客から外れていること（使わないカードを溜めない）
    const { stripeClient } = await import("../stripe-api.mjs");
    const 前のカード = await stripeClient()
      .paymentMethods.retrieve(登録後.stripe_payment_method_id)
      .catch(() => null);
    if (前のカード?.customer) {
      throw new Error("差し替えたのに前のカードが顧客に付いたままです");
    }

    // --- ③ 受け渡し待ちがあるうちは削除できない ---
    const l = await 出品を置く({
      sellerEmail: ACCOUNTS.seller.email,
      title: "カード削除の歯止め確認",
      price: 900,
      faculties: [ACCOUNTS.buyer.faculty],
    });
    const r = await 予約を置く({
      listing: l,
      buyerEmail: ACCOUNTS.buyer.email,
      status: "承認済み",
    });
    await go(page, "/mypage?tab=payment");
    await waitForText(page, "受け渡し待ちの取引", 20000);
    const 押せる = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .filter((b) => b.textContent?.includes("カードを削除する"))
        .some((b) => !b.disabled),
    );
    if (押せる) throw new Error("受け渡し待ちの取引があるのに削除ボタンが押せます");

    // 画面を通さず直接呼んでも断られること（画面を回避されても効くか）
    const 直接 = await page.evaluate(async () => {
      const res = await fetch("/api/payments/card", { method: "DELETE" });
      return { status: res.status, body: await res.json().catch(() => null) };
    });
    if (直接.status !== 409) {
      throw new Error(`APIを直接呼んでも消せてしまいます（${直接.status}）`);
    }
    log("受け渡し待ちの取引があるうちは、画面でもAPIでも削除できない");

    // --- ④ 取引を片付けてから削除 ---
    await must(
      admin().from("reservations").update({ status: "キャンセル" }).eq("id", r.id).select("id"),
      "reservations(キャンセル)",
    );
    await 回数制限をリセット(`card:${buyerId}`);
    await go(page, "/mypage?tab=payment");
    await waitForText(page, "カードを削除する", 20000);
    await clickText(page, "button", "カードを削除する");
    await waitForText(page, "カードを削除しますか？", 10000);
    await clickText(page, ".modal-actions button", "削除する");
    await waitForText(page, "カードは未登録です", 20000);

    if (await 保存済みカード(buyerId)) {
      throw new Error("削除したのに payment_customers に行が残っています");
    }
    const 外れたカード = await stripeClient()
      .paymentMethods.retrieve(変更後.stripe_payment_method_id)
      .catch(() => null);
    if (外れたカード?.customer) {
      throw new Error("削除したのに Stripe 側でカードが顧客に付いたままです");
    }
    log("削除できた（DB の行も Stripe 側の紐付けも消えている）");
  },
};
