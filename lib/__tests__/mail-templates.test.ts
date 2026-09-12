import { describe, expect, it } from "vitest";
import {
  paymentCompletedBuyerMail,
  paymentCompletedSellerMail,
  purchaseRequestMail,
  rescheduleProposedMail,
  reservationCancelledMail,
  scheduleConfirmedMail,
  type ReservationMailData,
} from "@/lib/mail-templates";
import { sellerNet } from "@/lib/constants";

// ===================================================
// 取引の通知メールの文面（A-1）
//
// 一番怖いのは「出品者に届く金額が実際と違う」こと。お金の数字は
// lib/constants.ts と lib/payment-provider/fees.ts の計算をそのまま使っているか
// を確かめる。数字を直書きし直すと、手数料の計算が2通りになって必ずずれる。
// ===================================================

const 取引: ReservationMailData = {
  reservationId: "0f7b1c2a-3d4e-4f50-9a1b-2c3d4e5f6071",
  listingTitle: "線形代数入門 第3版",
  price: 1200,
  buyerName: "木村 颯太",
  sellerName: "佐藤 花子",
  candidateSlots: [
    { date: "2026-09-14", time: "昼休み" },
    { date: "2026-09-15", time: "昼休み" },
  ],
  selectedSlot: 1,
  location: "Forest Gateway 3F",
  message: "経済学の授業で使います",
};

describe("決済完了メール", () => {
  it("出品者宛に、販売価格・手数料・受取額がすべて入る", () => {
    const m = paymentCompletedSellerMail(取引);
    expect(m.html).toContain("¥1,200"); // 販売価格
    expect(m.html).toContain("¥120"); // 手数料（10%切り上げ）
    expect(m.html).toContain("¥1,080"); // 受取額
    expect(m.subject).toContain("線形代数入門 第3版");
  });

  it("受取額は sellerNet の計算と一致する（端数が出る金額でも）", () => {
    for (const price of [1005, 999, 50, 3333]) {
      const m = paymentCompletedSellerMail({ ...取引, price });
      const 期待 = `¥${sellerNet(price).toLocaleString()}`;
      expect(m.html, `価格 ${price} 円のとき受取額 ${期待} が本文に無い`).toContain(期待);
    }
  });

  it("買い手宛には請求額と相手の名前が入り、手数料の話は出さない", () => {
    const m = paymentCompletedBuyerMail(取引);
    expect(m.html).toContain("¥1,200");
    expect(m.html).toContain("佐藤 花子");
    expect(m.html).not.toContain("手数料");
  });
});

describe("取引の各段階のメール", () => {
  it("購入希望：買い手の名前・候補日・メッセージが入る", () => {
    const m = purchaseRequestMail(取引);
    expect(m.html).toContain("木村 颯太");
    expect(m.html).toContain("9/14 昼休み");
    expect(m.html).toContain("9/15 昼休み");
    expect(m.html).toContain("経済学の授業で使います");
    expect(m.subject).toContain("購入希望");
  });

  it("購入希望：メッセージが空でも「（なし）」で埋まる", () => {
    const m = purchaseRequestMail({ ...取引, message: "   " });
    expect(m.html).toContain("（なし）");
  });

  it("日程確定（買い手宛）：確定した候補の日時と、支払いのタイミングが書いてある", () => {
    const m = scheduleConfirmedMail(取引, "buyer");
    expect(m.html).toContain("9/15 昼休み"); // selectedSlot = 1
    expect(m.html).toContain("QR");
    expect(m.html).toContain("受け渡しの場");
  });

  it("日程確定（出品者宛）：QRを読み取る側の案内になっている", () => {
    const m = scheduleConfirmedMail(取引, "seller");
    expect(m.html).toContain("読み取");
    expect(m.html).not.toContain("カードを登録");
  });

  it("日程確定：逆提案があればそちらの日時を優先する", () => {
    const m = scheduleConfirmedMail(
      { ...取引, proposedDate: "2026-09-20", proposedTime: "12:30", proposedLocation: "中央図書館前" },
      "buyer",
    );
    expect(m.html).toContain("9/20 12:30");
    expect(m.html).toContain("中央図書館前");
  });

  it("逆提案：提案された日時と場所が入る", () => {
    const m = rescheduleProposedMail({
      ...取引,
      proposedDate: "2026-09-20",
      proposedTime: "12:30",
      proposedLocation: "中央図書館前",
    });
    expect(m.html).toContain("9/20 12:30");
    expect(m.html).toContain("中央図書館前");
  });

  it("取りやめ：誰が取りやめたかが分かり、請求が無いことを伝える", () => {
    const 買い手が = reservationCancelledMail(取引, "buyer");
    expect(買い手が.html).toContain("木村 颯太");
    expect(買い手が.html).toContain("請求は発生していません");

    const 出品者が = reservationCancelledMail(取引, "seller");
    expect(出品者が.html).toContain("佐藤 花子");
  });
});

describe("すべてのメールに共通すること", () => {
  const 全部 = () => [
    purchaseRequestMail(取引),
    scheduleConfirmedMail(取引, "buyer"),
    scheduleConfirmedMail(取引, "seller"),
    rescheduleProposedMail({ ...取引, proposedDate: "2026-09-20", proposedTime: "12:30" }),
    reservationCancelledMail(取引, "buyer"),
    paymentCompletedBuyerMail(取引),
    paymentCompletedSellerMail(取引),
  ];

  it("件名は【TETOMI】で始まる", () => {
    for (const m of 全部()) expect(m.subject.startsWith("【TETOMI】"), m.subject).toBe(true);
  });

  it("未定義や NaN が本文に漏れない", () => {
    for (const m of 全部()) {
      expect(m.html, m.subject).not.toMatch(/undefined|NaN|null/);
      expect(m.subject).not.toMatch(/undefined|NaN|null/);
    }
  });

  it("本文に行き先のボタンがある", () => {
    for (const m of 全部()) expect(m.html, m.subject).toContain("<a href=");
  });
});
