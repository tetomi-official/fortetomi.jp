// QR発行・決済・手数料・売り切れ（T10 / T13 / T14 / T15 / T19 / T23 / T24）
import { ACCOUNTS, VIEWPORTS, apiAs, clickText, go, hasText, wait, waitForText } from "../helpers.mjs";
import { admin, listing, must, reservation, userIdByEmail, waitFor, 回数制限をリセット } from "../db.mjs";
import { TEST_CARDS, カードを入力, 本人認証を通す } from "../stripe-ui.mjs";
import { stripeClient } from "../stripe-api.mjs";
import { applicationFee, sellerNet } from "../constants.mjs";
import { 予約を置く, 出品を置く } from "../fixtures.mjs";

/** 買い手の受け渡し画面を開き、QRに載る合言葉（nonce）を横で受け取る。 */
async function QR画面を開いて合言葉を取る(page, reservationId) {
  let 合言葉 = null;
  const 受け取り = async (res) => {
    if (!res.url().includes("/api/payments/nonce")) return;
    try {
      const j = await res.json();
      if (j?.nonce) 合言葉 = j.nonce;
    } catch {
      /* JSON でなければ無視 */
    }
  };
  page.on("response", 受け取り);
  try {
    await go(page, `/checkout/${reservationId}`);
    await waitForText(page, "受け渡し用QR", 30000);
    await waitFor(() => 合言葉, { timeout: 15000, what: "QRの合言葉の受け取り" });
  } finally {
    page.off("response", 受け取り);
  }
  return 合言葉;
}

export const T10 = {
  id: "T10",
  title: "取引確定＋カード登録済みでQRが発行される",
  needs: ["reservationId", "cardReady"],
  stopOnFail: true,
  async run({ buyer, state, log }) {
    const 合言葉 = await QR画面を開いて合言葉を取る(buyer.page, state.reservationId);
    if (!/^[0-9a-f]{64}$/.test(合言葉)) throw new Error(`合言葉の形が違います: ${合言葉}`);
    state.nonce = 合言葉;

    // 画面にQRが描かれているか（zxing が SVG を書き出す）。
    // 合言葉を受け取った直後はまだ描画前なので、出てくるまで少し待つ。
    await buyer.page
      .waitForFunction(() => !!document.querySelector(".form-card svg"), {
        timeout: 10000,
        polling: 300,
      })
      .catch(() => {
        throw new Error("QRの画像が描かれていません");
      });

    // サーバーにはハッシュだけが保存され、生の合言葉は残っていないこと
    const r = await reservation(state.reservationId);
    if (!r.payment_nonce_hash) throw new Error("payment_nonce_hash が保存されていません");
    if (r.payment_nonce_hash === 合言葉) throw new Error("生の合言葉がそのままDBに入っています");
    log("QR表示・合言葉はハッシュで保存されている");
  },
};

export const T10b = {
  id: "T10b",
  title: "承認前や他人からはQRを出せない",
  needs: ["listingId", "cardReady"],
  async run({ buyer, seller, log }) {
    // 承認前（申請中）の予約ではQRが出ない
    const l = await 出品を置く({
      sellerEmail: ACCOUNTS.seller.email,
      title: "承認前のQR確認",
      price: 800,
      faculties: [ACCOUNTS.seller.faculty],
    });
    const r = await 予約を置く({ listing: l, buyerEmail: ACCOUNTS.buyer.email, status: "申請中" });

    const 申請中 = await apiAs(buyer.page, "/api/payments/nonce", { body: { reservationId: r.id } });
    if (申請中.status !== 409) throw new Error(`申請中でもQRが出ます: ${申請中.status} ${JSON.stringify(申請中.json)}`);
    log(`申請中は拒否された: ${申請中.json?.error}`);

    // 買い手以外（出品者）はQRを出せない
    const 他人 = await apiAs(seller.page, "/api/payments/nonce", { body: { reservationId: r.id } });
    if (他人.status !== 403) throw new Error(`買い手以外でもQRが出ます: ${他人.status}`);
    log(`買い手以外は拒否された: ${他人.json?.error}`);
  },
};

export const T24 = {
  id: "T24",
  title: "出品者の入金先が未設定ならQRを出さない",
  needs: ["cardReady"],
  async run({ buyer, log }) {
    const l = await 出品を置く({
      sellerEmail: ACCOUNTS.sellerNoConnect.email,
      title: "入金先が未設定の出品者",
      price: 700,
      faculties: [ACCOUNTS.sellerNoConnect.faculty],
    });
    const r = await 予約を置く({ listing: l, buyerEmail: ACCOUNTS.buyer.email, status: "承認済み" });

    const res = await apiAs(buyer.page, "/api/payments/nonce", { body: { reservationId: r.id } });
    if (res.status !== 409 || !res.json?.sellerNotReady) {
      throw new Error(
        `入金先が未設定の出品者でもQRが出ます: ${res.status} ${JSON.stringify(res.json)}\n` +
          "  ここを通すと、買い手が受け渡しの場で「課金できないQR」を出すことになります。",
      );
    }
    log(`拒否された: ${res.json.error}`);
  },
};

export const T13 = {
  id: "T13",
  title: "QRを読み取ると決済が走り、取引が完了になる",
  needs: ["reservationId", "nonce"],
  stopOnFail: true,
  async run({ seller, state, log }) {
    const 前 = await reservation(state.reservationId);
    if (前.paid_at) throw new Error("決済前のはずが、すでに決済済みです");

    // カメラの代わりに、読み取った文字列と同じ内容でサーバーを叩く
    // （カメラ→文字列の解読は lib/__tests__/payment-qr.test.ts と手動テストで確認）
    const res = await apiAs(seller.page, "/api/payments/charge", {
      body: { reservationId: state.reservationId, nonce: state.nonce },
    });
    if (res.status !== 200) {
      throw new Error(`決済が通りません: ${res.status} ${JSON.stringify(res.json)}`);
    }
    log(`決済API: ${JSON.stringify(res.json)}`);

    const r = await waitFor(
      async () => {
        const x = await reservation(state.reservationId);
        return x.paid_at ? x : null;
      },
      { timeout: 20000, what: "決済済みの記録" },
    );
    if (r.status !== "完了") throw new Error(`決済後のステータスが「完了」ではありません: ${r.status}`);
    if (!r.charge_id?.startsWith("ch_")) throw new Error(`charge_id が入っていません: ${r.charge_id}`);
    if (!r.payment_intent_id?.startsWith("pi_")) throw new Error(`payment_intent_id が入っていません: ${r.payment_intent_id}`);
    if (r.payment_provider !== "stripe") throw new Error(`決済会社の記録が違います: ${r.payment_provider}`);
    if (r.payment_nonce_hash !== null) throw new Error("使い終わった合言葉が消えていません");
    if (r.payment_status !== null) throw new Error(`失敗の記録が残っています: ${r.payment_status}`);

    state.paymentIntentId = r.payment_intent_id;
    state.chargeId = r.charge_id;
    log(`決済成立: ${r.payment_intent_id} / ${r.charge_id}`);
  },
};

export const T14 = {
  id: "T14",
  title: "同じQRを二度読んでも二重課金にならない",
  needs: ["reservationId", "nonce", "paymentIntentId"],
  async run({ seller, state, log }) {
    const res = await apiAs(seller.page, "/api/payments/charge", {
      body: { reservationId: state.reservationId, nonce: state.nonce },
    });
    if (res.status === 200) throw new Error("同じQRで2回目の決済が通ってしまいました");
    log(`2回目は拒否された: ${res.status} ${res.json?.error}`);

    const stripe = stripeClient();
    const r = await reservation(state.reservationId);
    const 一覧 = await stripe.paymentIntents.search({
      query: `metadata['reservation_id']:'${state.reservationId}'`,
    });
    const 成立 = 一覧.data.filter((p) => p.status === "succeeded");
    if (成立.length > 1) {
      throw new Error(`同じ取引で決済が ${成立.length} 件成立しています: ${成立.map((p) => p.id).join(", ")}`);
    }
    if (r.payment_intent_id !== state.paymentIntentId) {
      throw new Error("2回目の呼び出しで決済の記録が書き換わっています");
    }
    log(`Stripe 側でも成立は1件だけ: ${成立.map((p) => p.id).join(", ") || "(検索は反映待ちの場合あり)"}`);
  },
};

export const T15 = {
  id: "T15",
  title: "プラットフォーム手数料が正しく差し引かれ、出品者へ送金される",
  needs: ["paymentIntentId", "listingPrice"],
  async run({ state, log }) {
    const stripe = stripeClient();
    const pi = await stripe.paymentIntents.retrieve(state.paymentIntentId, {
      expand: ["latest_charge", "latest_charge.balance_transaction"],
    });

    const 価格 = state.listingPrice;
    const 期待手数料 = applicationFee(価格);
    const 期待受取 = sellerNet(価格);

    if (pi.amount !== 価格) throw new Error(`請求額が出品価格と違います: ${pi.amount} ≠ ${価格}`);
    if (pi.currency !== "jpy") throw new Error(`通貨が円ではありません: ${pi.currency}`);
    if (pi.application_fee_amount !== 期待手数料) {
      throw new Error(`手数料が違います: ${pi.application_fee_amount} ≠ ${期待手数料}（価格の10%切り上げ）`);
    }
    const 送金先 = typeof pi.transfer_data?.destination === "string"
      ? pi.transfer_data.destination
      : pi.transfer_data?.destination?.id;
    if (!送金先?.startsWith("acct_")) throw new Error(`出品者への送金先が設定されていません: ${送金先}`);

    // DB 上の出品者の Connect アカウントと一致するか
    const r = await reservation(state.reservationId);
    const rows = await must(
      admin().from("connect_accounts").select("stripe_account_id").eq("user_id", r.seller_id),
      "connect_accounts",
    );
    if (rows[0]?.stripe_account_id !== 送金先) {
      throw new Error(`送金先が出品者のアカウントと違います: ${送金先} ≠ ${rows[0]?.stripe_account_id}`);
    }

    log(`請求 ¥${価格} ／ 手数料 ¥${pi.application_fee_amount} ／ 出品者へ ¥${期待受取}（${送金先}）`);
    if (価格 - pi.application_fee_amount !== 期待受取) {
      throw new Error("請求額 − 手数料 が出品者の受取額と一致しません");
    }
    state.送金先 = 送金先;
  },
};

export const T17 = {
  id: "T17",
  title: "出品者へ入金予定額が立つ（手数料を引いた額が出品者の残高へ）",
  needs: ["paymentIntentId", "送金先", "listingPrice"],
  async run({ state, log }) {
    const stripe = stripeClient();
    const 相手口座 = { stripeAccount: state.送金先 };
    const 価格 = state.listingPrice;
    const 期待手数料 = applicationFee(価格);
    const 期待受取 = sellerNet(価格);

    // 送金（transfer）は課金の直後に少し遅れて作られることがあるので待つ。
    const 送金 = await waitFor(
      async () => {
        const pi = await stripe.paymentIntents.retrieve(state.paymentIntentId, {
          expand: ["latest_charge"],
        });
        const ch = pi.latest_charge;
        const id = typeof ch === "object" ? ch?.transfer : null;
        if (!id) return null;
        return stripe.transfers.retrieve(typeof id === "string" ? id : id.id);
      },
      { timeout: 30000, interval: 2000, what: "出品者への送金（transfer）の作成" },
    );

    if (送金.destination !== state.送金先) throw new Error(`送金先が違います: ${送金.destination}`);
    // destination charge では、送金は「満額」を送り、手数料はそこから別途引かれる。
    if (送金.amount !== 価格) throw new Error(`送金額が請求額と違います: ${送金.amount} ≠ ${価格}`);
    log(`送金 ${送金.id}: ¥${送金.amount} → ${送金.destination}`);

    // 出品者の口座から見た、実際の手取りを確かめる。ここが「入金予定額」になる。
    const 相手側の入金 = await stripe.charges.retrieve(
      送金.destination_payment,
      { expand: ["balance_transaction"] },
      相手口座,
    );
    const bt = 相手側の入金.balance_transaction;
    if (!bt) throw new Error("出品者側の入出金の記録が見つかりません");
    if (bt.amount !== 価格) throw new Error(`出品者側の売上が違います: ${bt.amount} ≠ ${価格}`);
    if (bt.fee !== 期待手数料) throw new Error(`差し引かれた手数料が違います: ${bt.fee} ≠ ${期待手数料}`);
    if (bt.net !== 期待受取) throw new Error(`出品者の手取りが違います: ${bt.net} ≠ ${期待受取}`);
    const 入金予定日 = new Date(bt.available_on * 1000).toISOString().slice(0, 10);
    log(`出品者の手取り ¥${bt.net}（売上 ¥${bt.amount} − 手数料 ¥${bt.fee}）／ 引き出せるのは ${入金予定日} から`);

    const 残高 = await stripe.balance.retrieve({}, 相手口座);
    const 保留 = 残高.pending.find((b) => b.currency === "jpy")?.amount ?? 0;
    const 利用可能 = 残高.available.find((b) => b.currency === "jpy")?.amount ?? 0;
    log(`出品者の残高: 利用可能 ¥${利用可能} / 入金待ち ¥${保留}`);
    if (保留 + 利用可能 < 期待受取) {
      throw new Error("出品者の残高に今回の売上が反映されていません");
    }
    state.入金予定日 = 入金予定日;
  },
};

export const T18 = {
  id: "T18",
  title: "出品者へ実際に入金される設定になっている（銀行口座と入金サイクル）",
  needs: ["送金先"],
  async run({ state, log }) {
    const stripe = stripeClient();
    const acct = await stripe.accounts.retrieve(state.送金先);
    if (!acct.payouts_enabled) {
      throw new Error("出品者のアカウントが入金可能になっていません（payouts_enabled = false）");
    }
    const 口座数 = acct.external_accounts?.data?.length ?? 0;
    if (!口座数) throw new Error("出品者に銀行口座が登録されていません");
    const 予定 = acct.settings?.payouts?.schedule;
    log(`入金先: 銀行口座 ${口座数} 件 / サイクル: ${JSON.stringify(予定)}`);

    const 入金 = await stripe.payouts.list({ limit: 3 }, { stripeAccount: state.送金先 });
    if (入金.data.length) {
      log(
        `直近の入金: ${入金.data
          .map((p) => `¥${p.amount}（${new Date(p.arrival_date * 1000).toISOString().slice(0, 10)} ${p.status}）`)
          .join(" / ")}`,
      );
    } else {
      log(`まだ入金は実行されていない（残高が確定する ${state.入金予定日 ?? "入金予定日"} 以降にStripeが自動で実行）`);
    }
    log("※ 実際の着金はテストモードでは確認できない。ここは設定と予定日までの確認");
  },
};

export const T19 = {
  id: "T19",
  title: "決済後、出品が売り切れ扱いになる",
  needs: ["listingId", "paymentIntentId"],
  async run({ buyer, state, log }) {
    const l = await listing(state.listingId);
    if (l.status !== "完了") throw new Error(`決済後も出品が「完了」になりません: ${l.status}`);
    log(`出品ステータス: ${l.status}`);

    // 買い手の一覧から消えているか
    await go(buyer.page, "/listings");
    await wait(1500);
    if (await hasText(buyer.page, "[E2E] 線形代数入門 第3版")) {
      throw new Error("決済済みの出品が、まだ教科書一覧に並んでいます");
    }
    log("教科書一覧から落ちていることを確認");
  },
};

export const T23 = {
  id: "T23",
  title: "Webhookが後から届いても二重に記録されない／署名は検証される",
  needs: ["paymentIntentId"],
  async run({ state, log }) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET が無いのでWebhookの確認ができません");
    const stripe = stripeClient();
    const base = process.env.BASE_URL ?? "http://localhost:3000";
    const url = `${base}/api/payments/stripe/webhook`;

    const 前 = await reservation(state.reservationId);
    const pi = await stripe.paymentIntents.retrieve(state.paymentIntentId, { expand: ["latest_charge"] });
    const 本文 = JSON.stringify({
      id: "evt_e2e_" + Date.now(),
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: pi },
    });

    // 正しい署名 → 200、かつ記録は変わらない
    const 署名 = stripe.webhooks.generateTestHeaderString({ payload: 本文, secret });
    const ok = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": 署名 },
      body: 本文,
    });
    if (ok.status !== 200) throw new Error(`正しい署名のWebhookが ${ok.status} で拒否されました`);

    const 後 = await reservation(state.reservationId);
    if (後.paid_at !== 前.paid_at) throw new Error("Webhookの再送で決済時刻が書き換わりました（二重記録）");
    if (後.charge_id !== 前.charge_id) throw new Error("Webhookの再送で charge_id が書き換わりました");
    log("同じ決済のWebhookが再度届いても記録は変わらない");

    // でたらめな署名 → 400
    const ng = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
      body: 本文,
    });
    if (ng.status !== 400) throw new Error(`署名が違うのに ${ng.status} で受け入れられました`);
    log("署名が違うWebhookは400で弾かれる");
  },
};

export const T13c = {
  id: "T13c",
  separate: true, // 全体の実行には含めない（scenarios/index.mjs の注意を参照）
  title: "登録は通ったカードがQR読み取りで断られたとき、日本語の文言が返り、決済済みにならない",
  async run({ buyer, seller, log }) {
    const buyerId = await userIdByEmail(ACCOUNTS.buyer.email);
    const 試すもの = [
      { 名前: "Radarがブロック（0019）", number: TEST_CARDS.Radarがブロック },
      { 名前: "課金で断られる（0341）", number: TEST_CARDS.登録は通るが課金で断られる },
    ];
    const 問題 = [];
    try {
      for (const t of 試すもの) {
        const l = await 出品を置く({
          sellerEmail: ACCOUNTS.seller.email,
          title: `課金で断られる確認 ${t.名前}`,
          price: 900,
          faculties: [ACCOUNTS.buyer.faculty],
        });
        const r = await 予約を置く({ listing: l, buyerEmail: ACCOUNTS.buyer.email, status: "承認済み" });

        // 買い手のカードをこのカードに差し替える（画面から登録する）
        await must(
          admin().from("payment_customers").delete().eq("user_id", buyerId).select("user_id"),
          "payment_customers(外す)",
        );
        await 回数制限をリセット(`card:${buyerId}`);
        // カードごとに新しいタブで開く（前のカードの Stripe の入力欄が残っていると、
        // 次の入力欄をうまく見つけられないことがあるため）。ログイン状態は同じまま。
        const page = await buyer.context.newPage();
        await page.setViewport(VIEWPORTS.pc);
        page.setDefaultTimeout(20000);
        let 合言葉;
        try {
          await go(page, `/checkout/${r.id}`);
          await waitForText(page, "支払いカードの登録", 30000);
          // 断られた直後は Stripe の入力欄が出るのが遅いことがあるので、長めに待つ
          await カードを入力(page, { number: t.number, timeout: 60000 });
          await clickText(page, "button", "カードを登録");
          await 本人認証を通す(page);
          await waitForText(page, "受け渡し用QR", 45000).catch(() => {
            throw new Error(`${t.名前}: 登録の時点で断られ、QRまで進めませんでした`);
          });
          合言葉 = await QR画面を開いて合言葉を取る(page, r.id);
        } catch (e) {
          const 画面 = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => "");
          throw new Error(`${e.message}\n  そのときの画面:\n${画面}`);
        } finally {
          await page.close();
        }
        const res = await apiAs(seller.page, "/api/payments/charge", {
          body: { reservationId: r.id, nonce: 合言葉 },
        });
        const 文 = res.json?.error ?? "";
        if (res.ok) {
          問題.push(`${t.名前}: 断られるはずの課金が通ってしまった`);
          continue;
        }
        if (res.status >= 500) 問題.push(`${t.名前}: サーバーエラー（${res.status}）になった`);
        if (!/[ぁ-んァ-ヶ一-龠]/.test(文)) 問題.push(`${t.名前}: 日本語の文言になっていない（${文}）`);
        if (/[a-z]+_[a-z_]+/i.test(文)) 問題.push(`${t.名前}: エラーコードがそのまま出ている（${文}）`);

        const 後 = await reservation(r.id);
        if (後.paid_at || 後.status === "完了") 問題.push(`${t.名前}: 断られたのに決済済みになっている`);
        log(`${t.名前} → ${res.status}「${文}」（記録: ${後.payment_status ?? "なし"}）`);
      }
    } finally {
      // 断られるカードを残すと、手で確かめるときに紛らわしいので外しておく
      await admin().from("payment_customers").delete().eq("user_id", buyerId);
    }
    if (問題.length) throw new Error(問題.join("\n"));
  },
};
