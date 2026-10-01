// Stripe まわり（T34 / T35 / T36）＝手動テスト表 M-7・M-4
//
// - T34 返金スクリプト（M-7 No.30〜33）
// - T35 「売上・入金を確認する」から Stripe の出品者向け画面へ入れる（M-4 No.23）
// - T36 受取口座の登録を始められ、途中でやめても続きから再開できる（M-4 No.20 の入口・No.21）
//
// Stripe の登録フォームそのものを最後まで埋めること（No.20 の後半）は、
// Stripe 側の画面の作りに強く依存して壊れやすいので手動テストに残す。
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ACCOUNTS, apiAs, go, launch, login, openPersona, wait, waitForText } from "../helpers.mjs";
import { admin, connectAccount, listing, must, reservation, userIdByEmail, waitFor } from "../db.mjs";
import { stripeClient } from "../stripe-api.mjs";
import { 予約を置く, 出品を置く } from "../fixtures.mjs";
import { sellerNet } from "../constants.mjs";
import { QR画面を開いて合言葉を取る } from "./05-payment.mjs";

const run = promisify(execFile);

/** 返金スクリプトを手で打つのと同じように動かす（環境変数はこのテストと同じもの＝手元のDB）。 */
async function 返金スクリプト(...args) {
  const { stdout } = await run("node", ["scripts/stripe-refund.mjs", ...args], { env: process.env });
  return stdout;
}

/** 出品者の Stripe 残高（保留中＋利用可能の円の合計）。 */
async function 出品者の残高(acct) {
  const b = await stripeClient().balance.retrieve({}, { stripeAccount: acct });
  const 円 = (list) => list.filter((x) => x.currency === "jpy").reduce((s, x) => s + x.amount, 0);
  return 円(b.pending) + 円(b.available);
}

export const T34 = {
  id: "T34",
  title: "返金スクリプトで、買い手へ返金・出品者の売上と手数料が巻き戻り、予約が「キャンセル」に戻る",
  needs: ["cardReady"],
  async run({ buyer, seller, log }) {
    const stripe = stripeClient();
    const l = await 出品を置く({
      sellerEmail: ACCOUNTS.seller.email,
      title: "返金の確認",
      price: 2000,
      faculties: [ACCOUNTS.buyer.faculty],
    });
    const r = await 予約を置く({ listing: l, buyerEmail: ACCOUNTS.buyer.email, status: "承認済み" });

    // 出品者の残高は、決済の前に測っておく（決済の入金が残高に出るまで少しかかるため、
    // 決済の直後に測ると「入金も返金もまだ反映されていない」値を拾ってしまう）
    const acct = (await connectAccount(await userIdByEmail(ACCOUNTS.seller.email))).stripe_account_id;
    const 残高_前 = await 出品者の残高(acct);
    const 受取額 = sellerNet(l.price);

    // --- まず決済まで進める ---
    const 合言葉 = await QR画面を開いて合言葉を取る(buyer.page, r.id);
    const res = await apiAs(seller.page, "/api/payments/charge", { body: { reservationId: r.id, nonce: 合言葉 } });
    if (res.status !== 200) throw new Error(`決済が通りません: ${res.status} ${JSON.stringify(res.json)}`);
    const 決済後 = await waitFor(
      async () => {
        const x = await reservation(r.id);
        return x.charge_id ? x : null;
      },
      { what: "決済の記録" },
    );
    const 決済後の残高 = await waitFor(
      async () => {
        const v = await 出品者の残高(acct);
        return v >= 残高_前 + 受取額 ? v : null;
      },
      { timeout: 20000, what: "出品者の残高への入金" },
    );
    log(`決済で出品者の Stripe 残高が ¥${残高_前.toLocaleString()} → ¥${決済後の残高.toLocaleString()}（受取額 ¥${受取額.toLocaleString()}）`);

    // --- --dry-run では何も変わらない ---
    const 試し = await 返金スクリプト(r.id, "--dry-run");
    if (!/何も変更していません/.test(試し)) throw new Error(`--dry-run の表示がいつもと違います:\n${試し}`);
    const 試し後 = await reservation(r.id);
    const 試しの返金 = await stripe.refunds.list({ charge: 決済後.charge_id });
    if (試し後.status !== "完了" || 試しの返金.data.length) throw new Error("--dry-run なのに何かが変わっています");
    log("--dry-run：表示だけで、Stripe も DB も変わらない");

    // --- 本番の返金（No.30） ---
    const 出力 = await 返金スクリプト(r.id);
    log(`スクリプトの出力: ${出力.split("\n").filter((s) => /返金:|キャンセル|完了」のまま/.test(s)).join(" / ")}`);

    const 問題 = [];
    const ch = await stripe.charges.retrieve(決済後.charge_id, { expand: ["transfer", "application_fee"] });
    if (!ch.refunded || ch.amount_refunded !== l.price) {
      問題.push(`買い手のカードへ全額返金されていない（返金額 ${ch.amount_refunded} / ${l.price}）`);
    } else {
      log(`買い手へ返金: ¥${ch.amount_refunded.toLocaleString()}`);
    }

    // No.31 出品者へ送った売上の巻き戻しと、手数料の返却
    const tr = ch.transfer;
    if (!tr || tr.amount_reversed !== tr.amount) {
      問題.push(`出品者への送金が巻き戻っていない（${tr?.amount_reversed ?? "?"} / ${tr?.amount ?? "?"}）`);
    }
    const fee = ch.application_fee;
    if (!fee || fee.amount_refunded !== fee.amount) {
      問題.push(`手数料が返されていない（${fee?.amount_refunded ?? "?"} / ${fee?.amount ?? "?"}）`);
    }
    if (tr && fee) log(`出品者への送金 ¥${tr.amount_reversed.toLocaleString()} を巻き戻し、手数料 ¥${fee.amount_refunded.toLocaleString()} も返却`);

    // 出品者の Stripe 残高が、決済の前の額に戻っているか。
    // この決済の形では、出品者へ全額を送ってから手数料を別に引くので、
    // 巻き戻しも「送金を戻す」「手数料を返す」の2つで受取額ぶん減る。
    const 残高_後 = await waitFor(
      async () => {
        const v = await 出品者の残高(acct);
        return v <= 残高_前 ? v : null;
      },
      { timeout: 20000, what: "出品者の残高の巻き戻し" },
    ).catch(() => null);
    if (残高_後 === null) {
      const 今 = await 出品者の残高(acct);
      問題.push(`出品者の Stripe 残高が決済前（¥${残高_前.toLocaleString()}）に戻らない: 今 ¥${今.toLocaleString()}`);
    } else {
      log(`返金で出品者の Stripe 残高が ¥${決済後の残高.toLocaleString()} → ¥${残高_後.toLocaleString()}（決済前の額に戻った）`);
    }

    // No.32 予約が「キャンセル」に戻り、決済の記録が消える
    const 後 = await reservation(r.id);
    if (後.status !== "キャンセル") 問題.push(`予約が「キャンセル」に戻っていない: ${後.status}`);
    if (後.paid_at || 後.charge_id || 後.payment_intent_id) 問題.push("予約に決済の記録が残っている");
    if (後.status === "キャンセル") log("予約は「キャンセル」に戻り、決済の記録も消えた");

    // No.33 出品は「完了」のまま（既知の不備 C-4：再出品は手作業）
    const 出品 = await listing(l.id);
    if (出品.status === "完了") {
      log("※ 出品は「完了」のまま残る（既知の不備 C-4。再出品するなら手で戻す必要がある）");
    } else {
      log(`★ 出品が「${出品.status}」になっている（C-4 が直った可能性。手動テスト表の No.33 を見直す）`);
    }

    // 後片付けで消せるよう、決済の記録が消えた予約はふつうのテストデータとして扱われる。
    await must(admin().from("listings").update({ status: "出品中" }).eq("id", l.id).select("id"), "listings(戻す)");

    if (問題.length) throw new Error(問題.join("\n"));
  },
};

export const T35 = {
  id: "T35",
  title: "「売上・入金を確認する」から Stripe の出品者向け画面へ入れる",
  async run({ seller, log }) {
    await go(seller.page, "/sell/connect");
    await waitForText(seller.page, "売上・入金を確認する", 20000).catch(async () => {
      const 画面 = await seller.page.evaluate(() => document.body.innerText.slice(0, 300));
      throw new Error(`入金先の登録が済んだ出品者なのに「売上・入金を確認する」が出ません。画面:\n${画面}`);
    });
    // リンクは使い捨て。ボタンと同じ API で発行して、行き先を確かめる。
    const res = await apiAs(seller.page, "/api/payments/connect/login-link");
    if (!res.ok || !res.json?.url) throw new Error(`管理画面のリンクを発行できません: ${res.status} ${JSON.stringify(res.json)}`);
    const url = new URL(res.json.url);
    if (!/(^|\.)stripe\.com$/.test(url.hostname)) throw new Error(`行き先が Stripe ではありません: ${url.hostname}`);

    // 実際に開いて、Stripe の画面が返ってくるか
    const page = await seller.context.newPage();
    try {
      const nav = await page.goto(res.json.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const 着いた = new URL(page.url());
      if (!nav || nav.status() >= 400) throw new Error(`Stripe の画面が開けません: ${nav?.status()}`);
      if (!/stripe\.com$/.test(着いた.hostname)) throw new Error(`Stripe 以外の画面に着きました: ${着いた.hostname}`);
      log(`ボタン → ${url.hostname} → ${着いた.hostname}${着いた.pathname.split("/").slice(0, 3).join("/")} が開いた`);
    } finally {
      await page.close();
    }
  },
};

// 入金先を持たない出品者。鈴木さん（未連携）は T24 で使うので、別の人を使う。
const 新しい出品者 = { email: "tanaka@g.chuo-u.ac.jp", password: "password123", name: "田中 太郎" };

/** Connect のボタンを押して、Stripe の登録画面へ遷移した先の URL を返す。 */
async function 登録ボタンを押す(page, ラベル) {
  await go(page, "/sell/connect");
  await waitForText(page, ラベル, 20000);
  const 遷移 = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes(t));
    b?.click();
  }, ラベル);
  await 遷移;
  return new URL(page.url());
}

export const T36 = {
  id: "T36",
  title: "受取口座の登録を始めると Stripe の登録画面へ進み、途中でやめても続きから再開できる",
  // 手元の環境（サイトのURLが http://localhost）では、口座を作るときに送る事業のURLを
  // Stripe が受け付けず、登録を始められない（lib/payment-provider/stripe-connect.ts の business_url）。
  // 本番（https://tetomi.jp）では起きない想定。手動テストで確かめる。直ったら印を外す。
  expectFail: true,
  async run({ artifacts, log }) {
    void artifacts;
    const id = await userIdByEmail(新しい出品者.email);
    const 前 = await connectAccount(id);

    const browser = await launch();
    try {
      const p = await openPersona(browser);
      await login(p.page, 新しい出品者);

      // --- 1回目：未作成なら「口座登録をはじめる」、2回目以降は「登録を続ける」 ---
      const 最初のラベル = 前 ? "登録を続ける" : "口座登録をはじめる";
      const 行き先1 = await 登録ボタンを押す(p.page, 最初のラベル);
      if (!/stripe\.com$/.test(行き先1.hostname)) throw new Error(`Stripe の登録画面に進みません: ${行き先1.href}`);
      log(`「${最初のラベル}」→ ${行き先1.hostname} の登録画面へ進んだ`);

      const 作られた = await connectAccount(id);
      if (!作られた?.stripe_account_id?.startsWith("acct_")) throw new Error("連結アカウントが DB に記録されていません");
      if (前 && 前.stripe_account_id !== 作られた.stripe_account_id) {
        throw new Error("続きから再開したのに、別の連結アカウントが作られています");
      }

      // --- 途中でやめた（何も入力せずに戻ってきた）とする ---
      await wait(500);
      await go(p.page, "/sell/connect");
      await waitForText(p.page, "続きから再開できます", 20000).catch(() => {
        throw new Error("途中でやめたあとに「続きから再開できます」の案内が出ません");
      });
      const 行き先2 = await 登録ボタンを押す(p.page, "登録を続ける");
      if (!/stripe\.com$/.test(行き先2.hostname)) throw new Error(`「登録を続ける」で Stripe に進みません: ${行き先2.href}`);
      const 再開後 = await connectAccount(id);
      if (再開後.stripe_account_id !== 作られた.stripe_account_id) {
        throw new Error("「登録を続ける」で、別の連結アカウントが作られています（最初からやり直しになる）");
      }
      log(`途中でやめても「登録を続ける」で同じアカウント（${再開後.stripe_account_id}）の続きへ進める`);

      // --- リンクの期限切れで Stripe から戻されたとき（refresh_url） ---
      await go(p.page, "/sell/connect/refresh").catch(() => {});
      await p.page
        .waitForFunction(() => /stripe\.com$/.test(location.hostname), { timeout: 30000, polling: 300 })
        .catch(() => {
          throw new Error("期限切れで戻されたとき（/sell/connect/refresh）に、Stripe へ自動で送り直されません");
        });
      log("リンクの期限切れで戻されても、自動で新しいリンクから Stripe へ送り直される");
    } finally {
      await browser.close().catch(() => {});
    }
  },
};
