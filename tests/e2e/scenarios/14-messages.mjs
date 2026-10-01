// メッセージが届いたことを知らせるメール（T41 / T42）＝ issue #59
//
// 文面そのもの（本文を載せない・スレッドのリンクが入る）は
// lib/__tests__/mail-templates.test.ts で見ている。ここで見るのは送る量と相手：
//   - 送ったら相手に届くか
//   - 連投しても増えないか
//   - 相手が画面を開いて読んでいる間は送らないか
//   - 読んだあとに送れば、また届くか
//   - 取引に関係ない人が API を直に叩いても断られるか
import { ACCOUNTS, apiAs, go, login, openPersona, wait, waitForText } from "../helpers.mjs";
import { 出品を置く, 予約を置く } from "../fixtures.mjs";
import { メールを待つ, 全部のメール, 受信箱を空にする } from "../mailbox.mjs";

/** 新着メッセージの知らせだけを数える（他の取引メールと混ざらないように）。 */
function 新着の知らせ(メール一覧) {
  return メール一覧.filter((m) => /メッセージが届きました/.test(m.subject));
}

/**
 * 通知は「相手が画面を開いて既読を書く時間」を少し待ってから送られる
 * （lib/notify-message.ts の 既読待ち_MS）。届かないことを確かめるときは、
 * その時間を過ぎてから数えないと「まだ来ていないだけ」と区別できない。
 */
const 知らせを待ちきる = () => wait(12000);

async function メッセージを送る(page, reservationId, body) {
  const res = await apiAs(page, "/api/messages", { body: { reservationId, body } });
  if (!res.ok) throw new Error(`メッセージを送れません: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.message;
}

export const T41 = {
  id: "T41",
  title: "メッセージを送ると相手にメールが届き、連投しても増えず、読めばまた届く",
  async run({ buyer, seller, state, log }) {
    const 出品 = await 出品を置く({
      sellerEmail: ACCOUNTS.seller.email,
      title: "メッセージ通知の確認用",
    });
    const 予約 = await 予約を置く({
      listing: 出品,
      buyerEmail: ACCOUNTS.buyer.email,
      status: "承認済み",
    });
    state.messageReservationId = 予約.id;
    await 受信箱を空にする();

    // ---- 1通目：出品者に届く ----
    const 本文 = "[E2E] 受け渡しの場所を変えたいです";
    await メッセージを送る(buyer.page, 予約.id, 本文);
    const 知らせ = await メールを待つ(
      { to: ACCOUNTS.seller.email, 件名: /メッセージが届きました/ },
      { timeout: 25000 },
    );
    log(`メッセージの知らせ → ${知らせ.to}「${知らせ.subject}」`);

    const 問題 = [];
    if (知らせ.text.includes(本文)) {
      問題.push("メールにやり取りの中身が載っている（誤送信で漏れる）");
    }
    if (!知らせ.html.includes(`thread=${予約.id}`)) {
      問題.push("メールにそのやり取りを開くリンクが入っていない");
    }
    if (!知らせ.text.includes(ACCOUNTS.buyer.name)) {
      問題.push("メールに送り主の名前が入っていない");
    }

    // ---- 連投しても増えない（相手がまだ読んでいないため）----
    await メッセージを送る(buyer.page, 予約.id, "[E2E] もう1通");
    await メッセージを送る(buyer.page, 予約.id, "[E2E] さらに1通");
    await 知らせを待ちきる();
    const 連投後 = 新着の知らせ(await 全部のメール()).length;
    if (連投後 !== 1) 問題.push(`連投で ${連投後} 通届いている（1通のはず）`);
    else log("連投しても知らせは1通のまま");

    // ---- メールのリンクからそのやり取りを開ける ----
    await go(seller.page, `/mypage?tab=messages&thread=${予約.id}`);
    await waitForText(seller.page, 本文);
    log("メールのリンクから、そのやり取りが開いた");
    await wait(2000); // 既読が記録されるのを待つ

    // ---- 相手が開いている間は送らない ----
    await メッセージを送る(buyer.page, 予約.id, "[E2E] 開いている人への1通");
    await 知らせを待ちきる();
    const 開いている間 = 新着の知らせ(await 全部のメール()).length;
    if (開いている間 !== 1) {
      問題.push(`相手が画面を開いている間にも知らせが増えた（${開いている間} 通）`);
    } else {
      log("相手が開いている間は知らせを送らない");
    }

    // ---- 画面を離れたあとに送れば、また届く ----
    await go(seller.page, "/listings");
    await メッセージを送る(buyer.page, 予約.id, "[E2E] 読んだあとの1通");
    await 知らせを待ちきる();
    const 最後 = 新着の知らせ(await 全部のメール()).length;
    if (最後 !== 2) 問題.push(`読んだあとの知らせが届かない（合計 ${最後} 通・2通のはず）`);
    else log("読んだあとに送れば、また届く");

    if (問題.length) throw new Error(問題.join("\n"));
  },
};

export const T42 = {
  id: "T42",
  title: "取引に関係ない人は、APIを直に叩いてもメッセージを送れない",
  needs: ["messageReservationId"],
  async run({ browser, state, log }) {
    const 他人 = await openPersona(browser);
    try {
      await login(他人.page, ACCOUNTS.sellerNoConnect);
      const res = await apiAs(他人.page, "/api/messages", {
        body: { reservationId: state.messageReservationId, body: "[E2E] 割り込み" },
      });
      if (res.ok) throw new Error("関係のない人がメッセージを送れてしまいました");
      if (![403, 404].includes(res.status)) {
        throw new Error(`断られ方がおかしい: ${res.status} ${JSON.stringify(res.json)}`);
      }
      log(`関係のない人は断られた（${res.status}）`);
    } finally {
      await 他人.context.close().catch(() => {});
    }
  },
};
