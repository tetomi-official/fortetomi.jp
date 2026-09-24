import { describe, expect, it } from "vitest";
import { loginHref, safeNextPath } from "../redirect";

describe("safeNextPath：ログイン後の戻り先", () => {
  it("このサイトの中のページはそのまま戻る", () => {
    expect(safeNextPath("/listings/abc")).toBe("/listings/abc");
    expect(safeNextPath("/listings?faculty=%E6%B3%95#top")).toBe("/listings?faculty=%E6%B3%95#top");
  });

  it("戻り先が無いときはトップ", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("外のサイトへは飛ばさない", () => {
    expect(safeNextPath("https://evil.example.com")).toBe("/");
    expect(safeNextPath("//evil.example.com")).toBe("/");
    expect(safeNextPath("/\\evil.example.com")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("listings/abc")).toBe("/");
  });

  it("改行などが混ざったものは弾く", () => {
    expect(safeNextPath("/listings" + String.fromCharCode(10) + "/abc")).toBe("/");
  });

  it("ログイン画面自身には戻らない（ログインが終わらなくなる）", () => {
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/login?next=/sell")).toBe("/");
  });
});

describe("loginHref：戻り先付きのログイン画面の URL", () => {
  it("今いるページを next に入れる", () => {
    expect(loginHref("/listings/abc")).toBe("/login?next=%2Flistings%2Fabc");
  });

  it("戻り先が無い・怪しいときは next を付けない", () => {
    expect(loginHref(null)).toBe("/login");
    expect(loginHref("https://evil.example.com")).toBe("/login");
    expect(loginHref("/")).toBe("/login");
  });
});
