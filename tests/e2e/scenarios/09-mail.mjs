// 取引の通知メール（T32 / T33）＝手動テスト表 M-3（No.12〜17）
//
// 文面そのもの（項目の並び・手数料の計算式）は lib/__tests__/mail-templates.test.ts で見ている。
// ここでは「実際の取引の流れの中で、正しい場面に、正しい相手へ、本物のデータで」
// 送られているかを見る。開発サーバーが書き出したメール（MAIL_CAPTURE_DIR）を読む。
//
// 迷惑メールに入らないか（No.18）・スマホのメールアプリで崩れないか（No.19）は
// 実際に届けないと分からないので、手動テストに残す。
import { ACCOUNTS, apiAs } from "../helpers.mjs";
import { reservation, waitFor } from "../db.mjs";
import { stripeClient } from "../stripe-api.mjs";
import { HANDOVER_TIME, PICKUP_LOCATION, SUPPORT_CONTACT } from "../constants.mjs";
import { 出品を置く, 日付 } from "../fixtures.mjs";
import { メールを待つ, 全部のメール, 受信箱を空にする } from "../mailbox.mjs";
import { QR画面を開いて合言葉を取る } from "./05-payment.mjs";

/** "2026-09-21" → "9/21"（メールでの日付の書き方。lib/labels.ts の formatSlot と同じ） */
const 月日 = (d) => {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
};
const 円 = (n) => `¥${n.toLocaleString("ja-JP")}`;

/** 本文に全部入っているか。足りないものを返す。 */
function 足りないもの(text, 入っているべき) {
  return 入っているべき.filter((s) => !text.includes(s));
}

/** 買い手として購入希望を出し、予約IDを返す。 */
async function 購入希望を出す(buyer, listing, slots, message) {
  const res = await apiAs(buyer.page, "/api/reservations", {
    body: {
      listingId: listing.id,
      sellerId: listing.seller_id,
      price: listing.price,
      slots,
      preferredLocation: PICKUP_LOCATION,
      message,
    },
  });
  if (!res.ok || !res.json?.id) throw new Error(`購入希望を出せません: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.id;
}

async function 更新(page, body, what) {
  const res = await apiAs(page, "/api/reservations", { method: "PATCH", body });
  if (!res.ok) throw new Error(`${what}に失敗: ${res.status} ${JSON.stringify(res.json)}`);
}

export const T32 = {
  id: "T32",
  title: "取引の各場面で、相手にメールが届き、日時・場所・金額が正しい（購入希望・別日程・取りやめ・日程確定）",
  async run({ buyer, seller, state, log }) {
    await 受信箱を空にする();
    const 買い手 = ACCOUNTS.buyer;
    const 出品者 = ACCOUNTS.seller;
    const 問題 = [];
    const 確かめる = (名前, m, 入っているべき) => {
      const 無い = 足りないもの(m.text, 入っているべき);
      if (無い.length) 問題.push(`${名前}: 本文に無い → ${無い.join(" / ")}`);
      else log(`${名前} → ${m.to}「${m.subject}」`);
    };

    // ===== 取引A：購入希望 → 別日程の提案 → 買い手が取りやめ =====
    const A = await 出品を置く({ sellerEmail: 出品者.email, title: "メール確認A", price: 1300, faculties: [買い手.faculty] });
    const A候補 = [
      { date: 日付(3), time: HANDOVER_TIME },
      { date: 日付(4), time: HANDOVER_TIME },
    ];
    const A予約 = await 購入希望を出す(buyer, A, A候補, "E2Eメール確認のメッセージ");

    // No.12 購入希望 → 出品者
    const 購入希望 = await メールを待つ({ to: 出品者.email, 件名: /購入希望が届きました/ });
    確かめる("購入希望（→出品者）", 購入希望, [
      A.title,
      買い手.name,
      円(1300),
      月日(A候補[0].date),
      月日(A候補[1].date),
      PICKUP_LOCATION,
      "E2Eメール確認のメッセージ",
    ]);

    // No.14 別日程の提案 → 買い手
    const 提案 = { date: 日付(5), time: HANDOVER_TIME, location: "中央図書館 入口" };
    await 更新(seller.page, { id: A予約, proposed: 提案 }, "別日程の提案");
    const 別日程 = await メールを待つ({ to: 買い手.email, 件名: /別の受け渡し日程が提案されました/ });
    確かめる("別日程の提案（→買い手）", 別日程, [A.title, 出品者.name, 月日(提案.date), 提案.location]);

    // No.15 取りやめ → 相手（買い手が取りやめたので出品者へ）
    await 更新(buyer.page, { id: A予約, status: "キャンセル" }, "取りやめ");
    const 取りやめ = await メールを待つ({ to: 出品者.email, 件名: /取引が取りやめになりました/ });
    確かめる("取りやめ（→出品者）", 取りやめ, [A.title, `${買い手.name} さんが`]);

    // ===== 取引B：購入希望 → 出品者が2つ目の候補で確定 =====
    const B = await 出品を置く({ sellerEmail: 出品者.email, title: "メール確認B", price: 1500, faculties: [買い手.faculty] });
    const B候補 = [
      { date: 日付(3), time: HANDOVER_TIME },
      { date: 日付(6), time: HANDOVER_TIME },
    ];
    const B予約 = await 購入希望を出す(buyer, B, B候補, "");
    await 更新(seller.page, { id: B予約, selectedSlot: 1 }, "日程の確定");

    // No.13 日程確定 → 買い手（選んだ2つ目の候補の日付になっているか）
    const 確定 = await メールを待つ({ to: 買い手.email, 件名: /受け渡し日が決まりました/ });
    // 当日の手順（集合・QR・現金なし・連絡先）も、本物のデータで入っているか見る。
    確かめる("日程確定（→買い手）", 確定, [
      B.title,
      出品者.name,
      月日(B候補[1].date),
      PICKUP_LOCATION,
      円(1500),
      "現金のやり取りはありません",
      SUPPORT_CONTACT,
    ]);
    if (確定.text.includes(月日(B候補[0].date))) {
      問題.push("日程確定（→買い手）: 選ばなかった1つ目の候補の日付が入っている");
    }

    // 操作した本人には届かないこと（相手方にだけ送る作り）
    const 全部 = await 全部のメール();
    const 本人宛 = 全部.filter(
      (m) =>
        (m.to === 買い手.email && /購入希望が届きました|取りやめ/.test(m.subject)) ||
        (m.to === 出品者.email && /別の受け渡し日程|受け渡し日が決まりました/.test(m.subject)),
    );
    if (本人宛.length) 問題.push(`操作した本人にも届いている: ${本人宛.map((m) => `${m.to}「${m.subject}」`).join(", ")}`);
    log(`この間に出たメールは ${全部.length} 通（すべて相手方宛て）`);

    if (問題.length) throw new Error(問題.join("\n"));
    state.mailReservationId = B予約;
    state.mailListing = B;
  },
};

export const T33 = {
  id: "T33",
  title: "決済完了のメールが買い手と出品者の両方に届き、出品者宛の金額が Stripe と一致する",
  needs: ["mailReservationId", "cardReady"],
  async run({ buyer, seller, state, log }) {
    const 買い手 = ACCOUNTS.buyer;
    const 出品者 = ACCOUNTS.seller;
    const B = state.mailListing;

    const 合言葉 = await QR画面を開いて合言葉を取る(buyer.page, state.mailReservationId);
    const res = await apiAs(seller.page, "/api/payments/charge", {
      body: { reservationId: state.mailReservationId, nonce: 合言葉 },
    });
    if (res.status !== 200) throw new Error(`決済が通りません: ${res.status} ${JSON.stringify(res.json)}`);

    // No.16 2通とも届く
    const 買い手宛 = await メールを待つ({ to: 買い手.email, 件名: /お支払いが完了しました/ });
    const 出品者宛 = await メールを待つ({ to: 出品者.email, 件名: /売上が確定しました/ });
    const 問題 = [];
    const 無い買い手 = 足りないもの(買い手宛.text, [B.title, 円(B.price), 出品者.name]);
    if (無い買い手.length) 問題.push(`決済完了（→買い手）: 本文に無い → ${無い買い手.join(" / ")}`);
    if (/手数料/.test(買い手宛.text)) 問題.push("決済完了（→買い手）: 買い手宛てに手数料の話が出ている");
    log(`決済完了 → ${買い手宛.to}「${買い手宛.subject}」`);
    log(`決済完了 → ${出品者宛.to}「${出品者宛.subject}」`);

    // No.17 出品者宛の金額を Stripe の実際の数字と突き合わせる
    const r = await waitFor(
      async () => {
        const x = await reservation(state.mailReservationId);
        return x.payment_intent_id ? x : null;
      },
      { what: "決済の記録" },
    );
    const pi = await stripeClient().paymentIntents.retrieve(r.payment_intent_id);
    const 販売価格 = pi.amount;
    const 手数料 = pi.application_fee_amount;
    const 受取額 = 販売価格 - 手数料;
    const 期待 = [`販売価格 ${円(販売価格)}`, `− ${円(手数料)}`, `お受け取り額 ${円(受取額)}`];
    const 無い出品者 = 足りないもの(出品者宛.text, [B.title, 買い手.name, ...期待]);
    if (無い出品者.length) {
      問題.push(`決済完了（→出品者）: Stripe の数字と合わない → ${無い出品者.join(" / ")}\n  本文: ${出品者宛.text}`);
    } else {
      log(`出品者宛の金額が Stripe と一致: 販売価格 ${円(販売価格)} − 手数料 ${円(手数料)} = お受け取り額 ${円(受取額)}`);
    }

    // 同じ決済で2通ずつ届いていないか（課金API と Webhook の両方から送る二重送信）
    await new Promise((ok) => setTimeout(ok, 3000));
    const 重複 = (await 全部のメール()).filter((m) => /お支払いが完了しました|売上が確定しました/.test(m.subject));
    if (重複.length !== 2) 問題.push(`決済完了のメールが ${重複.length} 通出ている（2通のはず）`);

    if (問題.length) throw new Error(問題.join("\n"));
  },
};
