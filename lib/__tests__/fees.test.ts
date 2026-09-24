import { describe, expect, it } from "vitest";
import { PLATFORM_FEE_RATE, sellerNet } from "@/lib/constants";
import { applicationFeeAmount } from "@/lib/payment-provider/fees";

// ===================================================
// プラットフォーム手数料（T15）
//
// ここで守りたいのは1点だけ:「画面に出す受取額」と「実際に取る手数料」を
// 足すと、必ず買い手への請求額に戻ること。片方だけ端数処理を変えると
// 1円ずれて、出品者の入金額と帳簿が合わなくなる。
// ===================================================

describe("手数料と受取額", () => {
  it("受取額 + 手数料 = 請求額（0〜5000円の全額で1円もずれない）", () => {
    const ずれた金額: number[] = [];
    for (let price = 0; price <= 5000; price++) {
      if (sellerNet(price) + applicationFeeAmount(price) !== price) ずれた金額.push(price);
    }
    expect(ずれた金額).toEqual([]);
  });

  it("手数料は10%の切り上げ、受取額は切り捨て", () => {
    expect(PLATFORM_FEE_RATE).toBe(0.1);
    // 割り切れる金額
    expect(sellerNet(1000)).toBe(900);
    expect(applicationFeeAmount(1000)).toBe(100);
    // 端数が出る金額（1005 * 0.9 = 904.5 → 切り捨てて904、手数料は101）
    expect(sellerNet(1005)).toBe(904);
    expect(applicationFeeAmount(1005)).toBe(101);
  });

  it("手数料も受取額もマイナスにならない", () => {
    for (const price of [0, 1, 9, 10, 49, 50, 99999]) {
      expect(applicationFeeAmount(price)).toBeGreaterThanOrEqual(0);
      expect(sellerNet(price)).toBeGreaterThanOrEqual(0);
    }
  });

  it("0円なら手数料も0円（application_fee_amount に0を渡さないための前提）", () => {
    expect(applicationFeeAmount(0)).toBe(0);
  });

  it("Stripe の最低額50円でも手数料が請求額を超えない", () => {
    expect(applicationFeeAmount(50)).toBe(5);
    expect(sellerNet(50)).toBe(45);
  });
});
