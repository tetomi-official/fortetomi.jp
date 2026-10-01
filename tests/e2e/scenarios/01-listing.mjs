// 出品まわり（T01 / T02）
import path from "node:path";
import { clickText, fillByLabel, findByText, go, hasText, waitForText, wait } from "../helpers.mjs";
import { E2E_MARK, admin, must } from "../db.mjs";
import { PICKUP_LOCATION } from "../constants.mjs";

const 写真 = ["public/images/gallery-science.jpg", "public/images/book-placeholder.jpg"].map((p) =>
  path.resolve(p),
);

const 出品内容 = {
  title: `${E2E_MARK} 線形代数入門 第3版`,
  subject: "線形代数学",
  author: "田中 一郎",
  publisher: "中央出版",
  isbn: "978-4-1234-5678-9",
  year: "2022",
  desc: "自動テストが作成した出品です。",
  price: "1200",
  condition: "書き込み少し",
};

/** 出品フォームの1ページ目を埋める。 */
async function 基本情報を埋める(page, { title = 出品内容.title } = {}) {
  await fillByLabel(page, "教科書タイトル", title);
  await fillByLabel(page, "授業名", 出品内容.subject);
  await fillByLabel(page, "著者名", 出品内容.author);
  await fillByLabel(page, "出版社", 出品内容.publisher);
  await fillByLabel(page, "ISBN", 出品内容.isbn);
  await fillByLabel(page, "出版年", 出品内容.year);
  await fillByLabel(page, "コメント", 出品内容.desc);
}

/** 写真を n 枚添付する。 */
async function 写真を添付(page, n) {
  const input = await page.$('input[type="file"]');
  if (!input) throw new Error("写真アップロードの入力欄が見つかりません");
  await input.uploadFile(...写真.slice(0, n));
  await page
    .waitForFunction((c) => document.querySelectorAll(".preview-thumb").length >= c, { timeout: 15000 }, n)
    .catch(() => {
      throw new Error(`写真が ${n} 枚ぶん表示されませんでした`);
    });
  await wait(400);
}

/** 出品が解禁されているか（フェーズが低いと「次へ」自体が押せない）。 */
async function 出品が解禁されている(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("button")].some(
      (b) => (b.textContent ?? "").includes("次へ") && !b.disabled,
    ),
  );
}

/**
 * 「次へ」を押して、次のステップへ進めたかを返す。
 * このフォームは入力が足りなくてもボタン自体は押せる作りで、
 * 押したときにトーストで知らせて止める。だから「押してみて進んだか」で見る。
 */
async function 次へ押してみる(page) {
  await clickText(page, "button", "次へ");
  await wait(900);
  return hasText(page, "03 — 状態");
}

export const T01 = {
  id: "T01",
  title: "出品できる（写真2枚・必須項目）",
  stopOnFail: true, // 以降のシナリオが全部この出品にぶら下がる
  async run({ seller, buyer, state, log }) {
    const page = seller.page;
    await go(page, "/sell");
    await waitForText(page, "01 — 基本情報");

    if (!(await 出品が解禁されている(page))) {
      throw new Error("出品が解禁されていません。NEXT_PUBLIC_RELEASE_PHASE=2 以上にして開発サーバーを再起動してください");
    }

    await 基本情報を埋める(page);
    await 写真を添付(page, 2);
    if (!(await 次へ押してみる(page))) {
      throw new Error("必須項目と写真2枚を入れても次のステップへ進めません");
    }
    await clickText(page, ".condition-opt", 出品内容.condition);
    await fillByLabel(page, "価格（円）", 出品内容.price);
    await fillByLabel(page, "受け渡し希望場所", PICKUP_LOCATION);
    await clickText(page, "button", "確認へ");

    await waitForText(page, "05 — 出品内容の確認");
    await clickText(page, "button", "出品する");
    await waitForText(page, "出品が完了しました", 90000);
    log("出品フォームの3ステップを通過");

    // --- DBで実物を確かめる ---
    const rows = await must(
      admin()
        .from("listings")
        .select("*")
        .eq("title", 出品内容.title)
        .order("created_at", { ascending: false })
        .limit(1),
      "listings(作成確認)",
    );
    if (!rows.length) throw new Error("画面は完了と出たのに、listings に行がありません");
    const l = rows[0];
    state.listingId = l.id;
    state.listingPrice = l.price;
    log(`出品ID ${l.id}`);

    if (l.status !== "出品中") throw new Error(`作成直後のステータスが「出品中」ではありません: ${l.status}`);
    if (l.price !== Number(出品内容.price)) throw new Error(`価格がずれています: ${l.price}`);
    if ((l.image_urls ?? []).length !== 2) throw new Error(`写真が2枚保存されていません: ${(l.image_urls ?? []).length}枚`);
    if (l.location !== PICKUP_LOCATION) throw new Error(`受け渡し場所が保存されていません: ${l.location}`);
    if (l.category !== "教科書") throw new Error(`カテゴリが教科書になっていません: ${l.category}`);
    if (!(l.faculties ?? []).includes("経済学部")) {
      throw new Error(`出品者の学部が faculties に入っていません: ${JSON.stringify(l.faculties)}`);
    }

    // --- 買い手の一覧と詳細に出るか ---
    await go(buyer.page, "/listings");
    await wait(1500);
    if (!(await findByText(buyer.page, ".listing-card, .listing-row, a", 出品内容.title))) {
      throw new Error("買い手の教科書一覧に、今出品した本が出てきません");
    }
    await go(buyer.page, `/listings/${l.id}`);
    await waitForText(buyer.page, 出品内容.title);
    if (!(await hasText(buyer.page, "¥1,200"))) throw new Error("詳細ページに価格が出ていません");
    log("買い手の一覧と詳細に表示されることを確認");
  },
};

export const T02 = {
  id: "T02",
  title: "出品のバリデーション（写真1枚・価格や場所が空なら進めない）",
  async run({ seller, log }) {
    const page = seller.page;
    await go(page, "/sell");
    await waitForText(page, "01 — 基本情報");

    // 何も入れていない状態では進めない
    if (await 次へ押してみる(page)) throw new Error("タイトルも授業名も空のまま次のステップへ進めてしまいます");
    log("空のままでは進めない");

    // 必須項目だけ入れて写真ゼロ → まだ進めない
    await 基本情報を埋める(page, { title: `${E2E_MARK} バリデーション確認` });
    if (await 次へ押してみる(page)) throw new Error("写真が0枚でも次のステップへ進めてしまいます");
    log("写真0枚では進めない");

    // 写真1枚 → まだ進めない（2枚以上が必須）
    await 写真を添付(page, 1);
    if (await 次へ押してみる(page)) throw new Error("写真が1枚でも次のステップへ進めてしまいます（2枚以上のはず）");
    log("写真1枚でも進めない");

    await 写真を添付(page, 2);
    if (!(await 次へ押してみる(page))) throw new Error("写真2枚にしても次のステップへ進めません");

    // 状態・価格・場所が空のまま「確認へ」→ 進めないこと
    await clickText(page, "button", "確認へ");
    await wait(600);
    if (await hasText(page, "05 — 出品内容の確認")) {
      throw new Error("状態・価格・場所が空でも確認画面へ進めてしまいます");
    }
    log("状態・価格・場所が空では確認へ進めない");

    // 後片付け: このシナリオは出品を作らないので、画面を離れるだけでよい
    await go(page, "/mypage");
  },
};
