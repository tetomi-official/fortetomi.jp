// カード登録と本人認証（T12）
import { clickText, go, waitForText } from "../helpers.mjs";
import { TEST_CARDS, カードを入力, 本人認証を通す } from "../stripe-ui.mjs";
import { admin, must, userIdByEmail } from "../db.mjs";
import { ACCOUNTS } from "../helpers.mjs";

export const T12 = {
  id: "T12",
  title: "買い手のカード登録（3Dセキュアを含む）",
  needs: ["reservationId"],
  stopOnFail: true, // カードが無いと以降の決済が全部できない
  async run({ buyer, state, log }) {
    const page = buyer.page;

    // 毎回「カード未登録の状態」から試したいので、前回のテストで登録した分を外す。
    // （Stripe 側の顧客は残るが、テストモードなので実害は無い）
    const buyerId = await userIdByEmail(ACCOUNTS.buyer.email);
    const { error: 削除失敗 } = await admin()
      .from("payment_customers")
      .delete()
      .eq("user_id", buyerId);
    if (削除失敗) throw new Error(`前回のカード登録を外せません: ${削除失敗.message}`);
    log("カード未登録の状態に戻してから試す");

    await go(page, `/checkout/${state.reservationId}`);

    // 承認済みでカード未登録なら、登録フォームが出るはず。
    await waitForText(page, "支払いカードの登録", 30000);
    log("受け渡し画面でカード登録を求められた（＝カードを入れるのはこの時点）");

    // 「いつ請求されるのか」がここに書いてあるか（書いてなければ記録だけ残す）
    const 画面 = await page.evaluate(() => document.body.innerText);
    if (!/QR/.test(画面) || !/(請求|課金|決済)/.test(画面)) {
      log("※ カード登録画面に「登録しただけでは請求されない／QR読み取りで決済」の説明が無い");
    }

    await カードを入力(page, { number: TEST_CARDS.ふつう });
    await clickText(page, "button", "カードを登録");

    const 押した = await 本人認証を通す(page);
    log(押した ? "3Dセキュアの確認ボタンを押した" : "3Dセキュアの確認ボタンは出なかった（自動で通った可能性）");

    // 登録が終わるとQRの画面に切り替わる
    await waitForText(page, "受け渡し用QR", 45000).catch(async () => {
      const err = await page.evaluate(() => document.body.innerText.slice(0, 600));
      throw new Error(`カード登録後にQR画面へ進みません。画面の文言:\n${err}`);
    });
    log("カード登録 → 受け渡し用QR の表示まで通った");

    // DB に保存されたか
    const rows = await must(
      admin().from("payment_customers").select("*").eq("user_id", buyerId),
      "payment_customers",
    );
    if (!rows.length) throw new Error("payment_customers にカードの記録がありません");
    const c = rows[0];
    if (c.provider !== "stripe") throw new Error(`決済会社が stripe ではありません: ${c.provider}`);
    if (!c.stripe_customer_id || !c.stripe_payment_method_id) {
      throw new Error("Stripe の顧客IDまたは支払い方法IDが保存されていません");
    }
    state.cardReady = true;
    state.stripeCustomerId = c.stripe_customer_id;
    log(`保存: ${c.stripe_customer_id} / ${c.stripe_payment_method_id}`);

    // --- 3Dセキュアが実際に効いたかを Stripe 側の記録で確かめる ---
    const { stripeClient } = await import("../stripe-api.mjs");
    const stripe = stripeClient();
    const si = await stripe.setupIntents.list({
      customer: c.stripe_customer_id,
      limit: 3,
      expand: ["data.latest_attempt"],
    });
    const 成立 = si.data.find((x) => x.status === "succeeded");
    if (!成立) throw new Error("Stripe 側に成立した SetupIntent がありません");
    const 要求 = 成立.payment_method_options?.card?.request_three_d_secure;
    const 結果 =
      成立.latest_attempt?.payment_method_details?.card?.three_d_secure ??
      成立.latest_attempt?.payment_method_details?.card_present ??
      null;
    log(`3Dセキュアの要求: ${要求 ?? "(なし)"} / 結果: ${JSON.stringify(結果) ?? "(記録なし)"}`);
    if (要求 !== "any") {
      throw new Error(
        `カード登録時に3Dセキュアを要求していません（request_three_d_secure=${要求}）。\n` +
          "  STRIPE_3DS_REQUIRED=false になっていないか確認してください。",
      );
    }
    if (!結果) {
      log("※ 3Dセキュアを要求しているが、このカードでは認証の記録が残っていない（Stripe側が不要と判断）");
    }
  },
};

export const T12b = {
  id: "T12b",
  title: "カードを登録しただけでは課金されない",
  needs: ["cardReady", "reservationId"],
  async run({ state, log }) {
    const { stripeClient } = await import("../stripe-api.mjs");
    const stripe = stripeClient();
    const buyerId = await userIdByEmail(ACCOUNTS.buyer.email);
    const rows = await must(
      admin().from("payment_customers").select("stripe_customer_id").eq("user_id", buyerId),
      "payment_customers",
    );
    const 顧客 = rows[0]?.stripe_customer_id;
    const 支払い = await stripe.paymentIntents.list({ customer: 顧客, limit: 10 });
    const 今回ぶん = 支払い.data.filter((p) => p.description?.includes(state.reservationId));
    if (今回ぶん.length) {
      throw new Error(`カードを登録しただけなのに、すでに課金の記録があります: ${今回ぶん.map((p) => p.id).join(", ")}`);
    }
    const r = await (await import("../db.mjs")).reservation(state.reservationId);
    if (r.paid_at || r.charge_id) throw new Error("カード登録だけで予約が決済済みになっています");
    log("カード登録の時点では課金も決済記録も無い（請求はQR読み取り時）");
  },
};
