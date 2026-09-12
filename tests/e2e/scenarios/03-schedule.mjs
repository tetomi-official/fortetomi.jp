// 日程調整と取引確定（T06 / T07 / T08 / T09 / T11）
import { ACCOUNTS, clickText, findByText, go, hasText, wait } from "../helpers.mjs";
import { admin, listing, must, reservation } from "../db.mjs";
import { asUser } from "../as-user.mjs";
import { 予約を置く, 出品を置く, 日付 } from "../fixtures.mjs";
import { HANDOVER_TIME } from "../constants.mjs";

/** マイページの指定タブを開く。 */
async function タブを開く(page, label) {
  await go(page, "/mypage");
  await clickText(page, ".sidebar-nav-item", label);
  await wait(1200);
}

export const T06 = {
  id: "T06",
  title: "日程調整：出品者が候補から1つ選んで確定できる",
  needs: ["reservationId"],
  stopOnFail: true,
  async run({ seller, state, log }) {
    await タブを開く(seller.page, "受け取った購入希望");
    if (!(await findByText(seller.page, "button", "この日時で確定"))) {
      throw new Error("「この日時で確定」のボタンが出品者の画面にありません");
    }
    await clickText(seller.page, "button", "この日時で確定");
    await wait(2000);

    const r = await reservation(state.reservationId);
    if (r.status !== "承認済み") throw new Error(`確定しても「承認済み」になりません: ${r.status}`);
    if (typeof r.selected_slot !== "number") {
      throw new Error(`選んだ候補（selected_slot）が記録されていません: ${r.selected_slot}`);
    }
    const 確定した候補 = r.candidate_slots[r.selected_slot];
    if (!確定した候補) throw new Error(`selected_slot が候補の範囲外です: ${r.selected_slot}`);
    if (確定した候補.time !== HANDOVER_TIME) throw new Error("確定した候補の時刻が昼休みではありません");
    log(`確定した受け渡し: ${確定した候補.date} ${確定した候補.time} / ${r.preferred_location}`);
    state.確定候補 = 確定した候補;
  },
};

export const T11 = {
  id: "T11",
  title: "取引確定すると出品が「予約済み」になる",
  needs: ["listingId", "reservationId"],
  async run({ state, log }) {
    const l = await listing(state.listingId);
    log(`確定後の出品ステータス: ${l.status}`);
    if (l.status !== "予約済み") {
      // 同じ本に別の購入希望がもう1件送れてしまうかも確かめる（二重売りの危険）。
      const 他 = await must(
        admin().from("reservations").select("id,status").eq("listing_id", state.listingId),
        "reservations(同じ出品)",
      );
      throw new Error(
        `出品が「予約済み」になりません（今は「${l.status}」）。\n` +
          "  ListingStatus に「予約済み」という値はあるのに、コードのどこからも書かれていません。\n" +
          "  そのため承認済みの取引があっても出品は一覧に残り続け、同じ本に複数の購入希望が付きます。\n" +
          `  この出品にひも付く購入希望: ${他.length} 件（${他.map((x) => x.status).join(", ")}）`,
      );
    }
  },
};

export const T07 = {
  id: "T07",
  title: "日程調整：出品者の逆提案を買い手が承諾できる",
  async run({ seller, buyer, state, log }) {
    // この枝は別の取引で確かめる（本線の予約はもう承認済みのため）。
    const l = await 出品を置く({
      sellerEmail: ACCOUNTS.seller.email,
      title: "日程の逆提案テスト",
      price: 900,
      faculties: [ACCOUNTS.seller.faculty],
    });
    const r = await 予約を置く({ listing: l, buyerEmail: ACCOUNTS.buyer.email });
    state.reschedReservationId = r.id;
    log(`逆提案用の予約 ${r.id}`);

    // --- 出品者が別日程を提案する ---
    await タブを開く(seller.page, "受け取った購入希望");
    await clickText(seller.page, "button", "別の日程を提案");
    await wait(800);

    const 提案日 = 日付(5);
    const 提案時刻 = "12:30"; // 逆提案の欄は input[type=time]。買い手側の「昼休み」とは別の形式になっている
    const 提案場所 = "中央図書館前";
    await seller.page.evaluate(
      (d, t, loc) => {
        // React の state に届くよう、value のセッターを直に呼んで input/change を出す。
        const set = (el, v) => {
          const setter = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(el),
            "value",
          ).set;
          setter.call(el, v);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const form = document.querySelector(".reschedule-form");
        if (!form) throw new Error("逆提案フォームが開いていません");
        set(form.querySelector('input[type="date"]'), d);
        set(form.querySelector('input[type="time"]'), t);
        set(form.querySelector('input[type="text"]'), loc);
      },
      提案日,
      提案時刻,
      提案場所,
    );
    await wait(400);
    await clickText(seller.page, "button", "この日程で提案する");
    await wait(2000);

    let 提案後 = await reservation(r.id);
    if (提案後.status !== "日程調整中") {
      throw new Error(`逆提案しても「日程調整中」になりません: ${提案後.status}`);
    }
    if (!提案後.proposed_date) throw new Error("提案した日程（proposed_date）が保存されていません");
    if (提案後.proposed_location !== 提案場所) {
      throw new Error(`提案した場所が保存されていません: ${提案後.proposed_location}（受け取り場所は変更できるべき）`);
    }
    log(`逆提案: ${提案後.proposed_date} ${提案後.proposed_time} / ${提案後.proposed_location}`);
    if (提案後.proposed_time !== HANDOVER_TIME) {
      log(
        `※ 買い手は「${HANDOVER_TIME}」しか選べないのに、出品者の逆提案は時刻の直接入力（${提案後.proposed_time}）。` +
          "同じ取引の中で受け渡し時間の決め方が2通りある",
      );
    }

    // --- 買い手の画面に提案が出て、承諾できる ---
    await タブを開く(buyer.page, "送った購入希望");
    if (!(await hasText(buyer.page, "出品者からの提案日程"))) {
      throw new Error("買い手の画面に出品者からの提案が表示されません");
    }
    if (!(await hasText(buyer.page, 提案場所))) {
      throw new Error("買い手の画面に提案された受け取り場所が出ていません");
    }
    await clickText(buyer.page, "button", "この日程で承諾");
    await wait(2000);

    提案後 = await reservation(r.id);
    if (提案後.status !== "承認済み") {
      throw new Error(`買い手が承諾しても「承認済み」になりません: ${提案後.status}`);
    }
    log("逆提案 → 承諾 → 承認済み まで通った");
  },
};

export const T08 = {
  id: "T08",
  title: "日程調整の権限：買い手は確定も逆提案もできない",
  needs: ["reschedReservationId"],
  async run({ state, log }) {
    const client = await asUser(ACCOUNTS.buyer);
    const id = state.reschedReservationId;

    // 買い手が「自分で候補を確定する」
    const 確定 = await client.from("reservations").update({ selected_slot: 0 }).eq("id", id).select("id");
    if (!確定.error && 確定.data?.length) {
      throw new Error("買い手が selected_slot を書き換えられてしまいます（出品者だけのはず）");
    }
    log(`買い手の候補確定は拒否された: ${確定.error?.message ?? "0行"}`);

    // 買い手が「自分で別日程を提案する」
    const 提案 = await client
      .from("reservations")
      .update({ proposed_date: "2099-01-01", proposed_time: HANDOVER_TIME, proposed_location: "どこか" })
      .eq("id", id)
      .select("id");
    if (!提案.error && 提案.data?.length) {
      throw new Error("買い手が proposed_* を書き換えられてしまいます（出品者だけのはず）");
    }
    log(`買い手の逆提案は拒否された: ${提案.error?.message ?? "0行"}`);

    // 念のため、実データが変わっていないこと
    const r = await reservation(id);
    if (r.proposed_location === "どこか") throw new Error("拒否されたはずの値が実際には書き込まれています");
  },
};

export const T09 = {
  id: "T09",
  title: "受け取り場所と時間：既定値が入り、変更もできる",
  needs: ["reservationId"],
  async run({ state, log }) {
    const r = await reservation(state.reservationId);
    if (!r.preferred_location) throw new Error("受け取り場所が保存されていません");
    if (r.candidate_slots.some((s) => s.time !== HANDOVER_TIME)) {
      throw new Error("受け渡し時間が昼休み固定になっていません");
    }
    log(`場所: ${r.preferred_location} / 時間: ${HANDOVER_TIME}（固定）`);
    log("※ 学部ごとの受け取り場所（PICKUP_LOCATIONS）は空のまま。全学部が同じ場所になる");
    log("※ 時間帯は「昼休み」以外を選べない。1限後・放課後などが要るなら要検討");
  },
};
