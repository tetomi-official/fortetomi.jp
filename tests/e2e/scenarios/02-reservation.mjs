// 購入予約まわり（T03 / T04 / T05）
import { apiAs, clickText, go, hasText, waitForText } from "../helpers.mjs";
import { admin, must, waitFor } from "../db.mjs";
import { HANDOVER_TIME, PICKUP_LOCATION } from "../constants.mjs";

/** 購入希望モーダルを開いて候補日を2件選び、確認画面まで進める。 */
async function 購入希望を確認画面まで(page, { listingId, message = "[E2E] 自動テスト" }) {
  await go(page, `/listings/${listingId}`);
  await clickText(page, "button", "購入を希望する");
  await waitForText(page, "受け渡し候補日");

  // 候補1つめ
  const selects = await page.$$(".slot-row select");
  if (!selects.length) throw new Error("受け渡し候補日の選択欄がありません");
  const 選べる日 = await page.evaluate(
    () => [...document.querySelectorAll(".slot-row select option")].map((o) => o.value).filter(Boolean),
  );
  if (選べる日.length < 2) throw new Error(`候補日の選択肢が足りません: ${選べる日.length}件`);
  await selects[0].select(選べる日[0]);

  // 候補2つめを足す（最大3件まで足せることの確認も兼ねる）
  await clickText(page, "button", "候補を追加");
  const selects2 = await page.$$(".slot-row select");
  await selects2[1].select(選べる日[1]);

  // 場所とメッセージ
  const 場所 = await page.evaluateHandle(() => {
    const g = [...document.querySelectorAll(".modal-reserve .form-group")].find(
      (x) => x.querySelector("label")?.textContent?.trim() === "希望場所",
    );
    return g?.querySelector("input") ?? null;
  });
  const el = 場所.asElement();
  if (!el) throw new Error("希望場所の入力欄がありません");
  const 既定値 = await page.evaluate((n) => n.value, el);
  // 既定値が入っている欄なので、選択し直してから上書きする
  // （三連クリックだけでは React の再描画で選択が外れることがある）。
  await el.click();
  await el.evaluate((n) => n.setSelectionRange(0, n.value.length));
  await el.type(PICKUP_LOCATION, { delay: 5 });

  const textarea = await page.$(".modal-reserve textarea");
  if (textarea) await textarea.type(message, { delay: 5 });

  await clickText(page, "button", "確認へ進む");
  await waitForText(page, "以下の内容で送信します");
  return { 選んだ日: [選べる日[0], 選べる日[1]], 既定の場所: 既定値 };
}

export const T03 = {
  id: "T03",
  title: "購入予約を送れる（候補日1〜3件・場所・メッセージ）",
  needs: ["listingId"],
  stopOnFail: true,
  async run({ buyer, state, log }) {
    const page = buyer.page;
    const { 選んだ日, 既定の場所 } = await 購入希望を確認画面まで(page, { listingId: state.listingId });

    // 受け取り場所の既定値（T09 の自動で見られる部分）
    if (既定の場所 !== PICKUP_LOCATION) {
      throw new Error(`受け渡し場所の既定値が入っていません: ${JSON.stringify(既定の場所)}`);
    }
    log(`受け渡し場所の既定値: ${既定の場所}`);

    // 確認画面に候補と場所が出ているか
    if (!(await hasText(page, HANDOVER_TIME))) {
      throw new Error("確認画面に受け渡し時間（昼休み）が出ていません");
    }

    await clickText(page, "button", "購入希望を送る");
    await waitForText(page, "購入希望", 20000);

    // 書き込みはサーバー経由なので、クリック直後にはまだ入っていない。
    // 固定の待ち時間ではなく、行ができるまで見に行く。
    const r = await waitFor(
      async () => {
        const rows = await must(
          admin()
            .from("reservations")
            .select("*")
            .eq("listing_id", state.listingId)
            .order("created_at", { ascending: false })
            .limit(1),
          "reservations(作成確認)",
        );
        return rows[0] ?? null;
      },
      { timeout: 20000, interval: 300, what: "購入希望の作成" },
    ).catch(() => {
      throw new Error("画面は送信できたのに、reservations に行がありません");
    });
    state.reservationId = r.id;
    state.sellerId = r.seller_id;
    log(`予約ID ${r.id}`);

    if (r.status !== "申請中") throw new Error(`作成直後のステータスが「申請中」ではありません: ${r.status}`);
    if (!Array.isArray(r.candidate_slots) || r.candidate_slots.length !== 2) {
      throw new Error(`候補が2件で保存されていません: ${JSON.stringify(r.candidate_slots)}`);
    }
    if (r.candidate_slots[0].date !== 選んだ日[0]) {
      throw new Error(`第1希望の日付がずれています: ${r.candidate_slots[0].date} ≠ ${選んだ日[0]}`);
    }
    if (r.candidate_slots.some((s) => s.time !== HANDOVER_TIME)) {
      throw new Error(`候補の時刻が「${HANDOVER_TIME}」になっていません`);
    }
    if (r.preferred_date !== 選んだ日[0]) {
      throw new Error("preferred_date に第1希望が入っていません（NOT NULL の互換用）");
    }
    if (r.price !== state.listingPrice) throw new Error(`価格が出品と違います: ${r.price}`);
    log("候補2件・場所・価格がDBに正しく入っている");
  },
};

export const T04 = {
  id: "T04",
  title: "購入予約が出品者に伝わる（ヘッダーの対応待ちバッジ）",
  needs: ["reservationId"],
  async run({ seller, log }) {
    // 出品者の画面を開き直すとバッジの件数が取り直される。
    await go(seller.page, "/mypage");
    await seller.page
      .waitForFunction(() => {
        const b = document.querySelector(".nav-notif-badge");
        return !!b && Number(b.textContent.replace("+", "")) > 0;
      }, { timeout: 15000, polling: 500 })
      .catch(() => {
        throw new Error("出品者のヘッダーに対応待ちのバッジが出ません");
      });
    const 件数 = await seller.page.$eval(".nav-notif-badge", (b) => b.textContent);
    log(`バッジの表示: ${件数}`);

    // 「受け取った購入希望」に実際に並ぶか
    await clickText(seller.page, ".sidebar-nav-item", "受け取った購入希望");
    await seller.page
      .waitForFunction(() => !!document.querySelector(".res-card"), { timeout: 15000, polling: 300 })
      .catch(() => {});
    if (!(await hasText(seller.page, "[E2E]"))) {
      throw new Error("「受け取った購入希望」にテストの購入希望が並びません");
    }
    log("受け取った購入希望の一覧に並ぶことを確認");
  },
};

export const T05 = {
  id: "T05",
  title: "「購入確定ではなく、QR読み取りで決済」の注意書きが出ている",
  needs: ["listingId"],
  async run({ buyer, state, log }) {
    const page = buyer.page;

    // 購入希望を送る直前（確認画面）に、いつ請求されるのかが書かれているべき。
    await 購入希望を確認画面まで(page, { listingId: state.listingId, message: "[E2E] 注意書き確認" });
    const 確認画面 = await page.evaluate(() => document.querySelector(".modal-reserve")?.innerText ?? "");
    log(`確認画面の文言: ${確認画面.replace(/\s+/g, " ").slice(0, 200)}`);

    const 足りないもの = [];
    if (!/QR/i.test(確認画面)) 足りないもの.push("QRに触れていない");
    if (!/(決済|支払|課金|請求)/.test(確認画面)) 足りないもの.push("支払いのタイミングに触れていない");
    if (!/(この時点|まだ|されません|発生しません)/.test(確認画面)) {
      足りないもの.push("「今は請求されない」と明記されていない");
    }

    // モーダルを閉じる（予約は作らない）
    await page.evaluate(() => document.querySelector(".modal-close")?.click());

    if (足りないもの.length) {
      throw new Error(
        "購入希望の確認画面に、決済のタイミングの説明がありません:\n" +
          足りないもの.map((m) => `  - ${m}`).join("\n") +
          "\n  現状この説明は components/PaymentQR.tsx（QRを出す画面）にしかなく、\n" +
          "  買い手は購入希望を送る時点で「いつ請求されるのか」が分かりません。",
      );
    }
  },
};

export const T04c = {
  id: "T04c",
  title: "予約の書き込みはサーバーが検査する（通知と同じリクエストの中）",
  needs: ["reservationId", "listingId"],
  async run({ buyer, seller, state, log }) {
    // 買い手が自分で「承認済み」にしようとする（申請中→承認済みは出品者だけ）
    const 自分で承認 = await apiAs(buyer.page, "/api/reservations", {
      method: "PATCH",
      body: { id: state.reservationId, status: "承認済み" },
    });
    if (自分で承認.status !== 409) {
      throw new Error(`買い手が自分で承認できてしまいます: ${自分で承認.status}`);
    }
    if (!/申請中|承認済み/.test(自分で承認.json?.error ?? "")) {
      throw new Error(`エラーが日本語で返っていません: ${自分で承認.json?.error}`);
    }
    log(`買い手の自己承認は拒否された: ${自分で承認.json.error}`);

    // 出品者が自分の出品に購入希望を出そうとする
    const 自分に購入 = await apiAs(seller.page, "/api/reservations", {
      body: {
        listingId: state.listingId,
        sellerId: state.sellerId,
        price: state.listingPrice,
        slots: [{ date: "2099-01-01", time: HANDOVER_TIME }],
        preferredLocation: PICKUP_LOCATION,
      },
    });
    if (自分に購入.status !== 400) {
      throw new Error(`自分の出品に購入希望を出せてしまいます: ${自分に購入.status}`);
    }
    log(`自分の出品への購入希望は拒否された: ${自分に購入.json?.error}`);

    // 候補が空・場所が空など、形がおかしい本文は受け付けない
    const 形が変 = await apiAs(buyer.page, "/api/reservations", {
      body: { listingId: state.listingId, sellerId: state.sellerId, price: 100, slots: [], preferredLocation: "" },
    });
    if (形が変.status !== 400) throw new Error(`候補ゼロでも通ります: ${形が変.status}`);
    log(`形のおかしい本文は拒否された: ${形が変.json?.error}`);

    // 存在しない予約
    const 無い = await apiAs(buyer.page, "/api/reservations", {
      method: "PATCH",
      body: { id: "00000000-0000-0000-0000-000000000000", status: "キャンセル" },
    });
    if (無い.status !== 404) throw new Error(`存在しない予約が通ります: ${無い.status}`);
    log("存在しない予約は404");
  },
};
