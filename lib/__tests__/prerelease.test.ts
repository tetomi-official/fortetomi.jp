import { afterEach, describe, expect, it, vi } from "vitest";

// ===================================================
// 段階解禁のルート遮断（proxy.ts が使う判定）
//
// ここを間違えると「決済の Webhook が 404 で届かない」という、
// 課金は成立したのに記録が漏れる事故になる（実際にフェーズ0で起きている）。
// ===================================================

/** フェーズを差し替えてモジュールを読み直す（RELEASE_PHASE は読み込み時に確定するため）。 */
async function フェーズ(phase: string) {
  vi.stubEnv("NEXT_PUBLIC_RELEASE_PHASE", phase);
  vi.resetModules();
  return import("@/lib/prerelease");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("段階解禁", () => {
  it("フェーズ0は閲覧のみ（購入も出品もできない）", async () => {
    const m = await フェーズ("0");
    expect(m.canReserve).toBe(false);
    expect(m.canSell).toBe(false);
    expect(m.blockedRoute("/checkout/abc")).toEqual({ isApi: false });
    expect(m.blockedRoute("/api/payments/charge")).toEqual({ isApi: true });
    expect(m.blockedRoute("/api/reservations")).toEqual({ isApi: true });
  });

  it("フェーズ1で購入・決済が開く", async () => {
    const m = await フェーズ("1");
    expect(m.canReserve).toBe(true);
    expect(m.canSell).toBe(false);
    expect(m.blockedRoute("/checkout/abc")).toBeNull();
    expect(m.blockedRoute("/api/payments/charge")).toBeNull();
    expect(m.blockedRoute("/api/reservations")).toBeNull();
  });

  it("フェーズ2で出品が開く", async () => {
    const m = await フェーズ("2");
    expect(m.canSell).toBe(true);
  });

  it("未設定はフェーズ0と同じ", async () => {
    vi.stubEnv("NEXT_PUBLIC_RELEASE_PHASE", "");
    vi.resetModules();
    const m = await import("@/lib/prerelease");
    expect(m.canReserve).toBe(false);
  });

  it("決済会社からの Webhook はどのフェーズでも必ず通す", async () => {
    const m = await フェーズ("0");
    expect(m.blockedRoute("/api/payments/webhook")).toBeNull();
    expect(m.blockedRoute("/api/payments/stripe/webhook")).toBeNull();
  });

  it("遮断の対象外のページは触らない", async () => {
    const m = await フェーズ("0");
    for (const path of ["/", "/listings", "/listings/abc", "/mypage", "/login", "/sell", "/terms"]) {
      expect(m.blockedRoute(path), `遮断してはいけない: ${path}`).toBeNull();
    }
  });

  it("前方一致で別のパスを巻き込まない", async () => {
    const m = await フェーズ("0");
    // /checkout-guide は /checkout とは別のページ。遮断してはいけない。
    expect(m.blockedRoute("/checkout-guide")).toBeNull();
  });
});
