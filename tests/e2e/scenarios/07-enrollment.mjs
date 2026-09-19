// 在籍期限切れ（T28 / T29）＝手動テスト表 M-8
//
// profiles.enrollment_valid_until を過去にして、画面とサーバーの両方で止まることを見る。
// 期限はテストの最後に必ず元へ戻す（戻し忘れると後のシナリオや手元の確認が全部おかしくなる）。
import { ACCOUNTS, apiAs, go, hasText, wait, waitForText } from "../helpers.mjs";
import { E2E_MARK, admin, must, userIdByEmail } from "../db.mjs";
import { asUser } from "../as-user.mjs";
import { 出品を置く, 明日 } from "../fixtures.mjs";
import { HANDOVER_TIME, PICKUP_LOCATION } from "../constants.mjs";

const 昨日 = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

/** 指定したユーザーの在籍期限を過去にして fn を走らせ、終わったら元に戻す。 */
async function 期限切れにして(email, fn) {
  const id = await userIdByEmail(email);
  const [元] = await must(
    admin().from("profiles").select("enrollment_valid_until").eq("id", id),
    "profiles(在籍期限の読み取り)",
  );
  await must(
    admin().from("profiles").update({ enrollment_valid_until: 昨日() }).eq("id", id).select("id"),
    "profiles(期限切れにする)",
  );
  try {
    return await fn(id);
  } finally {
    await must(
      admin()
        .from("profiles")
        .update({ enrollment_valid_until: 元.enrollment_valid_until })
        .eq("id", id)
        .select("id"),
      "profiles(期限を戻す)",
    );
  }
}

export const T28 = {
  id: "T28",
  title: "在籍期限切れだと出品できない（フォームの代わりに再認証の案内）",
  async run({ seller, log }) {
    await 期限切れにして(ACCOUNTS.seller.email, async (sellerId) => {
      // --- 画面：出品フォームではなく再認証の案内が出る ---
      await go(seller.page, "/sell");
      await waitForText(seller.page, "大学メールの再認証が必要です");
      if (await hasText(seller.page, "教科書タイトル")) {
        throw new Error("期限切れなのに出品フォームが出ています");
      }
      const 再認証リンク = await seller.page.$('a[href="/reverify"]');
      if (!再認証リンク) throw new Error("「再認証する」のリンクがありません");
      log("/sell に再認証の案内が出て、フォームは出ない");

      // --- サーバー：画面を飛ばして直接書き込んでも RLS が止める ---
      const client = await asUser(ACCOUNTS.seller);
      const { error } = await client.from("listings").insert({
        title: `${E2E_MARK} 期限切れの出品`,
        subject: "E2Eテスト科目",
        description: "期限切れでも入るかの確認",
        category: "教科書",
        condition: "書き込みなし",
        price: 500,
        location: PICKUP_LOCATION,
        image_urls: ["/images/book-placeholder.jpg"],
        seller_id: sellerId,
        faculties: [ACCOUNTS.seller.faculty],
      });
      if (!error) throw new Error("期限切れでも出品をDBに直接書き込めてしまいます");
      log(`直接の書き込みも拒否された: ${error.message}`);
    });
  },
};

export const T29 = {
  id: "T29",
  title: "在籍期限切れだと購入希望を送れない",
  async run({ buyer, log }) {
    // 相手の出品は有効な出品者（佐藤）のものを使う。期限切れにするのは買い手だけ。
    const l = await 出品を置く({
      sellerEmail: ACCOUNTS.seller.email,
      title: "在籍期限切れの購入確認",
      price: 700,
      faculties: [ACCOUNTS.buyer.faculty],
    });

    await 期限切れにして(ACCOUNTS.buyer.email, async () => {
      // --- 画面：購入希望のボタンを押すと再認証へ案内される ---
      await go(buyer.page, `/listings/${l.id}`);
      await buyer.page.waitForSelector(".btn-buy-main", { timeout: 15000 });
      await buyer.page.click(".btn-buy-main");
      await buyer.page
        .waitForFunction(() => location.pathname === "/reverify", { timeout: 10000, polling: 200 })
        .catch(() => {});
      await wait(300);
      const 今の場所 = await buyer.page.evaluate(() => location.pathname);
      if (今の場所 !== "/reverify") {
        const モーダル = await hasText(buyer.page, "購入希望を送る");
        throw new Error(
          `再認証へ案内されません（今: ${今の場所}${モーダル ? "・購入希望の入力画面が開いた" : ""}）`,
        );
      }
      log("購入希望ボタン → /reverify に移動した");

      // --- サーバー：画面を飛ばして API を叩いても止まる ---
      const res = await apiAs(buyer.page, "/api/reservations", {
        body: {
          listingId: l.id,
          sellerId: l.seller_id,
          price: l.price,
          slots: [{ date: 明日(), time: HANDOVER_TIME }],
          preferredLocation: PICKUP_LOCATION,
        },
      });
      if (res.ok) throw new Error(`期限切れでも API から購入希望を作れてしまいます: ${res.status}`);
      const 作られた = await must(
        admin().from("reservations").select("id").eq("listing_id", l.id),
        "reservations(期限切れの確認)",
      );
      if (作られた.length > 0) throw new Error("API は失敗を返したのに予約が作られています");
      log(`API も拒否された: ${res.status} ${res.json?.error ?? ""}`);
    });
  },
};
