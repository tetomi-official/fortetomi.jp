import { describe, expect, it } from "vitest";
import {
  cardBrandLabel,
  formatDateTime,
  paymentStateLabel,
  cardExpiryLabel,
  formatSlot,
  formatYmd,
  isCardExpired,
  reservationBadgeClass,
  statusLabel,
  yen,
} from "@/lib/labels";
import { isAllowedEmail, isValidEmail } from "@/lib/constants";

describe("表示の整形", () => {
  it("金額に区切りと円記号が付く", () => {
    expect(yen(0)).toBe("¥0");
    expect(yen(1200)).toBe("¥1,200");
    expect(yen(1234567)).toBe("¥1,234,567");
  });

  it("受け渡し候補は 月/日 時刻 の形になる", () => {
    expect(formatSlot("2026-06-30", "昼休み")).toBe("6/30 昼休み");
    expect(formatSlot("2026-06-05", "10:00")).toBe("6/5 10:00");
  });

  it("旧データ（日付が YYYY-MM-DD でない）はそのまま出す", () => {
    expect(formatSlot("6月30日", "午前中（9:00〜12:00）")).toBe("6月30日 午前中（9:00〜12:00）");
  });

  it("入金予定日は 月/日（曜日） の形になる", () => {
    expect(formatYmd("2026-09-25")).toBe("9/25（金）");
    expect(formatYmd("2026-09-29")).toBe("9/29（火）");
    // 元日。時差で前日にずれないこと（Stripe から来る日付は日本時間で解釈済み）。
    expect(formatYmd("2027-01-01")).toBe("1/1（金）");
  });

  it("入金予定日が無い・形が違うときはそのまま返す", () => {
    expect(formatYmd("")).toBe("");
    expect(formatYmd("2026/09/25")).toBe("2026/09/25");
  });

  it("予約ステータスごとに違うバッジの色が付く", () => {
    const 色 = ["申請中", "日程調整中", "承認済み", "完了", "キャンセル"].map(reservationBadgeClass);
    expect(new Set(色).size).toBe(5); // 5種類が全部別の色
    expect(reservationBadgeClass("申請中")).toBe("badge-pending");
  });

  it("知らないステータスが来ても落ちない", () => {
    expect(reservationBadgeClass("なにこれ")).toBe("badge-pending");
    expect(statusLabel("なにこれ").label).toBe("なにこれ");
  });

  it("出品ステータスすべてに表示名がある", () => {
    expect(statusLabel("出品中").label).toBe("出品中");
    expect(statusLabel("予約済み").label).toBe("予約済み");
    expect(statusLabel("完了").label).toBe("取引完了");
  });
});

describe("メールアドレスの判定", () => {
  it("大学ドメインだけ通す", () => {
    expect(isAllowedEmail("sato@g.chuo-u.ac.jp")).toBe(true);
    expect(isAllowedEmail("  SATO@G.CHUO-U.AC.JP  ")).toBe(true);
    expect(isAllowedEmail("sato@gmail.com")).toBe(false);
    expect(isAllowedEmail("sato@g.chuo-u.ac.jp.evil.com")).toBe(false);
  });

  it("個人メールの形だけ見る", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.co")).toBe(false);
  });
});

describe("カードの表示（#53）", () => {
  it("決済会社ごとの表記ゆれを1つにそろえる", () => {
    // Stripe は小文字、PAY.jp は表記付きで返す。
    expect(cardBrandLabel("visa")).toBe("VISA");
    expect(cardBrandLabel("Visa")).toBe("VISA");
    expect(cardBrandLabel("mastercard")).toBe("Mastercard");
    expect(cardBrandLabel("MasterCard")).toBe("Mastercard");
    expect(cardBrandLabel("amex")).toBe("American Express");
    expect(cardBrandLabel("American Express")).toBe("American Express");
  });

  it("知らないブランドはそのまま出す", () => {
    expect(cardBrandLabel("なにこれPay")).toBe("なにこれPay");
    expect(cardBrandLabel("  ")).toBe("カード");
  });

  it("有効期限は年月で出す。分からなければ空", () => {
    expect(cardExpiryLabel(12, 2030)).toBe("2030年12月");
    expect(cardExpiryLabel(1, 2027)).toBe("2027年1月");
    expect(cardExpiryLabel(0, 0)).toBe("");
  });

  it("有効期限はその月の末日まで使える", () => {
    const 今 = new Date("2026-09-21T00:00:00+09:00");
    expect(isCardExpired(9, 2026, 今)).toBe(false); // 今月ちょうど
    expect(isCardExpired(8, 2026, 今)).toBe(true); // 先月
    expect(isCardExpired(1, 2027, 今)).toBe(false);
    expect(isCardExpired(0, 0, 今)).toBe(false); // 分からないものは切れ扱いにしない
  });
});

describe("決済の状況（管理画面 #60）", () => {
  it("成立しなかった状態を、支払い済みより先に出す", () => {
    // チャージバックは決済が成立したあとに起きるので paid_at が入ったまま来る。
    // 「支払い済み」を先に見てしまうと、いちばん困る状態が隠れる。
    expect(paymentStateLabel("2026-09-20T10:00:00Z", "disputed")).toEqual({
      label: "チャージバック",
      tone: "ng",
      alert: true,
    });
  });

  it("決済失敗と本人認証待ちを見分ける", () => {
    expect(paymentStateLabel(null, "failed").label).toBe("決済失敗");
    expect(paymentStateLabel(null, "failed").tone).toBe("ng");
    expect(paymentStateLabel(null, "requires_action").label).toBe("本人認証待ち");
    expect(paymentStateLabel(null, "requires_action").tone).toBe("warn");
  });

  it("困りごとが無ければ、支払い済みか未決済になる", () => {
    expect(paymentStateLabel("2026-09-20T10:00:00Z", null)).toEqual({
      label: "支払い済み",
      tone: "ok",
      alert: false,
    });
    expect(paymentStateLabel(null, null)).toEqual({
      label: "未決済",
      tone: "none",
      alert: false,
    });
  });
});

describe("日時の整形（管理画面 #60）", () => {
  it("月/日 時:分 の形にする", () => {
    const d = new Date(2026, 8, 20, 9, 5);
    expect(formatDateTime(d.toISOString())).toBe("9/20 09:05");
  });

  it("無いときと壊れているときは空文字", () => {
    expect(formatDateTime(null)).toBe("");
    expect(formatDateTime("ではない")).toBe("");
  });
});
