import { describe, expect, it } from "vitest";
import { decodePaymentQR, encodePaymentQR } from "@/lib/payments";

// ===================================================
// 受け渡しQRの中身（T13/T14 の前提）
//
// QRには予約IDとワンタイムの合言葉（nonce）が入る。ここが緩いと、
// 出品者がでたらめな文字列を読み取ったときにサーバーへ変な値が飛ぶ。
// ===================================================

const 予約ID = "0f7b1c2a-3d4e-4f50-9a1b-2c3d4e5f6071";
const 合言葉 = "a".repeat(64);

describe("QRの読み書き", () => {
  it("書いたものがそのまま読み戻せる", () => {
    const text = encodePaymentQR(予約ID, 合言葉);
    expect(text).toBe(`tetomi:pay:${予約ID}:${合言葉}`);
    expect(decodePaymentQR(text)).toEqual({ reservationId: 予約ID, nonce: 合言葉 });
  });

  it("前後の空白は無視する（カメラ読み取りで混ざることがある）", () => {
    expect(decodePaymentQR(`  ${encodePaymentQR(予約ID, 合言葉)}\n`)).not.toBeNull();
  });

  it("大文字で書かれていても読める", () => {
    expect(decodePaymentQR(encodePaymentQR(予約ID, 合言葉).toUpperCase())).not.toBeNull();
  });

  it("形が違うものは受け取らない", () => {
    const だめな文字列 = [
      "",
      "https://tetomi.jp/",
      "tetomi:pay:" + 予約ID, // 合言葉が無い
      `tetomi:pay:${予約ID}:${"a".repeat(63)}`, // 合言葉が1文字短い
      `tetomi:pay:${予約ID}:${"a".repeat(65)}`, // 1文字長い
      `tetomi:pay:${予約ID}:${"z".repeat(64)}`, // 16進数でない
      `tetomi:charge:${予約ID}:${合言葉}`, // 前置きが違う
      `tetomi:pay:${予約ID}:${合言葉} OR 1=1`, // 余計なものが後ろに付いている
      `${encodePaymentQR(予約ID, 合言葉)}\n${encodePaymentQR(予約ID, 合言葉)}`, // 2本つながっている
    ];
    for (const text of だめな文字列) {
      expect(decodePaymentQR(text), `受け取ってはいけない: ${JSON.stringify(text)}`).toBeNull();
    }
  });
});
