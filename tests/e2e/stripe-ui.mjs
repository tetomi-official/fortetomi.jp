// ===================================================
// Stripe のカード入力欄（iframe の中）を操作する部品。
//
// PaymentElement も 3Dセキュアの画面も、別ドメインの iframe に描かれる。
// 出てくる順番もタイミングもまちまちなので、「全部のフレームを探して、
// 目当ての部品があるものを使う」という書き方にしている。
// ===================================================

import { wait } from "./helpers.mjs";

/** 全フレームを走査して、セレクタが見つかった最初のフレームを返す。 */
async function フレームを探す(page, selector, { timeout = 30000 } = {}) {
  const limit = Date.now() + timeout;
  for (;;) {
    for (const f of page.frames()) {
      try {
        const el = await f.$(selector);
        if (el) return { frame: f, el };
      } catch {
        /* 消えた途中のフレームは飛ばす */
      }
    }
    if (Date.now() > limit) return null;
    await wait(400);
  }
}

/** テキストが合う押せるものを、全フレームから探してクリックする。 */
async function フレーム内をクリック(page, 正規表現, { timeout = 30000 } = {}) {
  const limit = Date.now() + timeout;
  for (;;) {
    for (const f of page.frames()) {
      try {
        const 押した = await f.evaluate((src) => {
          const re = new RegExp(src, "i");
          const 候補 = [...document.querySelectorAll("button, a, input[type=submit], [role=button]")];
          const el = 候補.find((e) => re.test(e.textContent ?? "") || re.test(e.value ?? ""));
          if (!el) return false;
          el.click();
          return true;
        }, 正規表現.source);
        if (押した) return true;
      } catch {
        /* 別ドメインで評価できないフレームは飛ばす */
      }
    }
    if (Date.now() > limit) return false;
    await wait(500);
  }
}

/**
 * カード番号・有効期限・CVC を入力する。
 * PaymentElement は1つの iframe に3つの入力欄をまとめて出す。
 */
export async function カードを入力(page, { number, exp = "12 / 34", cvc = "123" }) {
  const 見つかった = await フレームを探す(page, 'input[name="number"]');
  if (!見つかった) {
    throw new Error(
      "Stripe のカード入力欄（iframe）が出てきません。\n" +
        "  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY と /api/payments/setup-intent の応答を確認してください。",
    );
  }
  const { frame } = 見つかった;
  const 打つ = async (sel, v) => {
    const el = await frame.$(sel);
    if (!el) throw new Error(`Stripe の入力欄が見つかりません: ${sel}`);
    await el.click({ clickCount: 3 });
    await el.type(v, { delay: 40 });
  };
  await 打つ('input[name="number"]', number);
  await 打つ('input[name="expiry"]', exp);
  await 打つ('input[name="cvc"]', cvc);
  // 郵便番号を求める見せ方のときだけ入れる（日本のカードでは通常出ない）。
  const 郵便 = await frame.$('input[name="postalCode"]');
  if (郵便) {
    await 郵便.click({ clickCount: 3 });
    await 郵便.type("1000001", { delay: 30 });
  }
  await wait(300);
}

/**
 * 3Dセキュアの確認画面が出たら通す。
 *
 * Stripe は認証と関係ない補助の iframe（端末情報の収集など）も常に置くので、
 * 「フレームがあるか」では判断できない。押せるボタンが実際に見つかったときだけ押す。
 * 画面が出ないカード・自動で通るカードもあるので、見つからなくてもエラーにはしない。
 * 3Dセキュアが本当に効いたかは、あとで Stripe の記録側で確かめる。
 */
export async function 本人認証を通す(page, { timeout = 12000, 失敗させる = false } = {}) {
  const 認証ボタン = 失敗させる ? /^\s*(fail|失敗)/i : /(complete|authorize|authenticate|完了|承認)/i;
  const 押せた = await フレーム内をクリック(page, 認証ボタン, { timeout });
  if (押せた) await wait(2500);
  return 押せた;
}

/** よく使うテストカード（Stripe 公式）。 */
export const TEST_CARDS = {
  ふつう: "4242424242424242",
  本人認証が必要: "4000002500003155",
  残高不足: "4000000000009995",
  Radarがブロック: "4100000000000019",
};
