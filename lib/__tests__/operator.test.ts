import { describe, expect, it } from "vitest";
import { isOperatorEmail, operatorMayVisit, OPERATOR_HOME } from "@/lib/operator";

describe("isOperatorEmail", () => {
  it("運営のアドレスを見分ける（大文字小文字・前後の空白は無視）", () => {
    expect(isOperatorEmail("tetomitextbook@gmail.com")).toBe(true);
    expect(isOperatorEmail("  TetomiTextbook@Gmail.com  ")).toBe(true);
  });

  it("それ以外は運営ではない", () => {
    expect(isOperatorEmail("sato@g.chuo-u.ac.jp")).toBe(false);
    expect(isOperatorEmail("dare-demo@gmail.com")).toBe(false);
    // 似せたアドレスで通らないこと
    expect(isOperatorEmail("tetomitextbook@gmail.com.evil.com")).toBe(false);
    expect(isOperatorEmail("x-tetomitextbook@gmail.com")).toBe(false);
    expect(isOperatorEmail(null)).toBe(false);
    expect(isOperatorEmail("")).toBe(false);
  });
});

describe("operatorMayVisit", () => {
  it("運営の仕事に要る場所は開ける", () => {
    expect(operatorMayVisit("/admin")).toBe(true);
    expect(operatorMayVisit("/admin/")).toBe(true);
    // ログアウトとパスワードの変更のため
    expect(operatorMayVisit("/mypage")).toBe(true);
    expect(operatorMayVisit("/mypage/settings")).toBe(true);
    // ログインそのものと、メールの確認リンクの受け口
    expect(operatorMayVisit("/login")).toBe(true);
    expect(operatorMayVisit("/auth/confirm")).toBe(true);
    // 画面ではないので巻き込まない
    expect(operatorMayVisit("/api/enrollment/heal")).toBe(true);
  });

  it("学生向けの画面は開けない", () => {
    expect(operatorMayVisit("/")).toBe(false);
    expect(operatorMayVisit("/listings")).toBe(false);
    expect(operatorMayVisit("/listings/abc")).toBe(false);
    expect(operatorMayVisit("/sell")).toBe(false);
    expect(operatorMayVisit("/checkout")).toBe(false);
  });

  it("名前が似ているだけの別のパスを通さない", () => {
    expect(operatorMayVisit("/administrators")).toBe(false);
    expect(operatorMayVisit("/mypages")).toBe(false);
    expect(operatorMayVisit("/apiary")).toBe(false);
  });

  it("戻り先は取引一覧で、そこは必ず開ける（堂々めぐりにならない）", () => {
    expect(operatorMayVisit(OPERATOR_HOME)).toBe(true);
  });
});
