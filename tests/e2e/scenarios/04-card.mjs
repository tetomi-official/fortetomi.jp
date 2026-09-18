// カード登録と本人認証（T12）
import { clickText, go, waitForText } from "../helpers.mjs";
import { TEST_CARDS, カードを入力, 本人認証を通す } from "../stripe-ui.mjs";
import { admin, must, userIdByEmail, 回数制限をリセット } from "../db.mjs";
import { 予約を置く, 出品を置く } from "../fixtures.mjs";
import { ACCOUNTS } from "../helpers.mjs";

/** カード登録フォームに出ている赤字のエラー文を読む（出ていなければ null）。 */
async function エラー文を読む(page, { timeout = 30000 } = {}) {
  const 文 = await page
    .waitForFunction(
      () => {
        const el = [...document.querySelectorAll(".form-card p")].find((p) =>
          (p.getAttribute("style") ?? "").includes("192, 57, 43") ||
          (p.getAttribute("style") ?? "").toLowerCase().includes("c0392b"),
        );
        return el?.textContent?.trim() || false;
      },
      { timeout, polling: 300 },
    )
    .then((h) => h.jsonValue())
    .catch(() => null);
  return 文;
}

/** 買い手に見せてよい文言か（日本語で、コードや英語がそのまま出ていない）。 */
function 文言の問題(文) {
  if (!文) return "エラー文が画面に出ていない";
  if (!/[ぁ-んァ-ヶ一-龠]/.test(文)) return "日本語になっていない";
  if (/[a-z]+_[a-z_]+/i.test(文)) return "エラーコードがそのまま出ている";
  if (/[A-Za-z]{4,}(\s+[A-Za-z]{3,}){2,}/.test(文)) return "英語の文がそのまま出ている";
  return null;
}

export const T12c = {
  id: "T12c",
  separate: true, // 全体の実行には含めない（scenarios/index.mjs の注意を参照）
  title: "カード登録で断られたとき・本人確認をやめたときに、日本語の文言が出る（エラー画面にならない）",
  async run({ buyer, log }) {
    const page = buyer.page;
    const buyerId = await userIdByEmail(ACCOUNTS.buyer.email);
    // 自分専用の「承認済み」の取引を用意する（前のシナリオに頼らず単独で流せるように）
    const l = await 出品を置く({
      sellerEmail: ACCOUNTS.seller.email,
      title: "カード登録の失敗確認",
      price: 800,
      faculties: [ACCOUNTS.buyer.faculty],
    });
    const r = await 予約を置く({ listing: l, buyerEmail: ACCOUNTS.buyer.email, status: "承認済み" });
    // カード未登録の状態から始める（登録済みだとフォームが出ない）。
    await must(admin().from("payment_customers").delete().eq("user_id", buyerId).select("user_id"), "payment_customers(外す)");
    await 回数制限をリセット(`card:${buyerId}`);

    // Radar でブロックされるカード（0019）は、登録の時点では通ってしまい、
    // QR読み取りで課金するときに初めて断られる。そちらは T13c で見る。
    // 本人確認のカードを先に試す。断られたカードの直後だと、Stripe が不正対策の
    // 確認を挟むことがあり、本人確認の画面の出方が不安定になるため。
    const 試すもの = [
      { 名前: "本人確認を途中でやめる（3155）", number: TEST_CARDS.本人認証が必要, 失敗させる: true, 期待: /認証|本人|確認/ },
      { 名前: "残高不足（9995）", number: TEST_CARDS.残高不足, 期待: /残高|不足|利用できません|使用できません|拒否/ },
    ];

    const 問題 = [];
    for (const t of 試すもの) {
      await go(page, `/checkout/${r.id}`);
      await waitForText(page, "支払いカードの登録", 30000);
      // 断られた直後は Stripe の入力欄が出るのが遅いことがあるので、長めに待つ
      await カードを入力(page, { number: t.number, timeout: 60000 }).catch(async (e) => {
        const 画面 = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => "");
        throw new Error(`${t.名前}: ${e.message}\n  そのときの画面:\n${画面}`);
      });
      await clickText(page, "button", "カードを登録");
      if (t.失敗させる) {
        const 押した = await 本人認証を通す(page, { 失敗させる: true, timeout: 45000 });
        if (!押した) 問題.push(`${t.名前}: 本人確認の画面（失敗させるボタン）が出なかった`);
      }

      const 文 = await エラー文を読む(page);
      const 画面 = await page.evaluate(() => document.body.innerText);
      if (/Internal Server Error|Application error|\b500\b/.test(画面)) {
        問題.push(`${t.名前}: エラー画面になった`);
        continue;
      }
      const ng = 文言の問題(文);
      if (ng) {
        問題.push(`${t.名前}: ${ng}（${文 ?? "表示なし"}）`);
        continue;
      }
      if (!t.期待.test(文)) log(`※ ${t.名前}: 何が起きたかが伝わりにくいかも`);
      log(`${t.名前} →「${文}」`);
    }

    // 断られたカードが登録済み扱いになっていないこと
    const rows = await must(
      admin().from("payment_customers").select("user_id").eq("user_id", buyerId),
      "payment_customers(確認)",
    );
    if (rows.length) 問題.push("断られたカードなのに登録済みとして保存されている");

    if (問題.length) throw new Error(問題.join("\n"));
  },
};

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
    await 回数制限をリセット(`card:${buyerId}`);
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
