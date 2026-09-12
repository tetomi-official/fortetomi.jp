// ===================================================
// 補助データの作成。
//
// 「出品できること」「予約を送れること」自体は画面を操作して確かめる（T01/T03）。
// それが済んだあとの枝分かれ（逆提案・キャンセル・未連携の出品者）まで毎回
// 画面から作ると時間がかかるだけなので、そこはDBに直接置く。
//
// ここで作るものにも必ず [E2E] の印を付ける（後片付けの目印）。
// ===================================================

import { E2E_MARK, admin, must, userIdByEmail } from "./db.mjs";
import { HANDOVER_TIME } from "./constants.mjs";

/** テスト用の出品を1件置く。 */
export async function 出品を置く({ sellerEmail, title, price = 1200, faculties = [] }) {
  const sellerId = await userIdByEmail(sellerEmail);
  const rows = await must(
    admin()
      .from("listings")
      .insert({
        title: `${E2E_MARK} ${title}`,
        subject: "E2Eテスト科目",
        description: "自動テストが作成した出品です。残っていたら消して構いません。",
        category: "教科書",
        condition: "書き込みなし",
        price,
        location: "Forest Gateway 3F",
        image_urls: ["/images/book-placeholder.jpg"],
        seller_id: sellerId,
        faculties,
      })
      .select("*"),
    "listings(挿入)",
  );
  return rows[0];
}

/** テスト用の購入希望を1件置く。 */
export async function 予約を置く({ listing, buyerEmail, status = "申請中", slots }) {
  const buyerId = await userIdByEmail(buyerEmail);
  const 候補 = slots ?? [{ date: 明日(), time: HANDOVER_TIME }];
  const rows = await must(
    admin()
      .from("reservations")
      .insert({
        listing_id: listing.id,
        buyer_id: buyerId,
        seller_id: listing.seller_id,
        price: listing.price,
        preferred_date: 候補[0].date,
        preferred_time: 候補[0].time,
        preferred_location: "Forest Gateway 3F",
        candidate_slots: 候補,
        message: `${E2E_MARK} 自動テスト`,
        status,
      })
      .select("*"),
    "reservations(挿入)",
  );
  return rows[0];
}

/** YYYY-MM-DD（ローカル日付）。 */
export function 日付(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const 明日 = () => 日付(1);
