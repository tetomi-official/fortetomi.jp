import { describe, expect, it } from "vitest";
import {
  addDays,
  confirmedHandoverDate,
  reminderTargetDate,
  todayInJapan,
} from "@/lib/handover-reminder";

// ===================================================
// 受け渡しリマインドの日付（#58）
//
// 一番怖いのは「1日ずれて、前日の夜のつもりが当日の夜に届く」こと。
// サーバーの時計は UTC（Vercel も GitHub Actions も）で、日本時間の夜は
// UTC ではまだ前日なので、素の Date で計算すると必ずずれる。
// 日本時間の朝（UTC 前日 23:00）と夜（UTC 同日 11:00）の両方で確かめる。
// ===================================================

describe("日本時間の今日", () => {
  it("日本時間の朝8時（UTC では前日の23時）でも、その日の日付になる", () => {
    expect(todayInJapan(new Date("2026-09-14T23:00:00Z"))).toBe("2026-09-15");
  });

  it("日本時間の夜20時（UTC では同じ日の11時）も、その日の日付になる", () => {
    expect(todayInJapan(new Date("2026-09-15T11:00:00Z"))).toBe("2026-09-15");
  });

  it("日本時間の 0:00 ちょうど（UTC では前日15時）で日付が変わる", () => {
    expect(todayInJapan(new Date("2026-09-14T14:59:59Z"))).toBe("2026-09-14");
    expect(todayInJapan(new Date("2026-09-14T15:00:00Z"))).toBe("2026-09-15");
  });
});

describe("日数を足す", () => {
  it("月をまたいでもずれない", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-09-29", 2)).toBe("2026-10-01");
  });

  it("年をまたいでもずれない", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("うるう年の2月もずれない", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-28", 2)).toBe("2028-03-01");
  });

  it("日付の形が違えば止まる（気づかずに変な日を対象にしない）", () => {
    expect(() => addDays("2026/09/30", 1)).toThrow();
  });
});

describe("その回が対象にする受け渡し日", () => {
  it("2日前の回（日本時間の朝8時）は、2日後の受け渡しを対象にする", () => {
    expect(reminderTargetDate("2日前", new Date("2026-09-14T23:00:00Z"))).toBe("2026-09-17");
  });

  it("前日の回（日本時間の夜20時）は、翌日の受け渡しを対象にする", () => {
    expect(reminderTargetDate("前日", new Date("2026-09-15T11:00:00Z"))).toBe("2026-09-16");
  });

  it("同じ受け渡しが、2日前の回と前日の回でちょうど1回ずつ拾われる", () => {
    const 受け渡し日 = "2026-10-01";
    // 2日前の朝＝9/29 8:00（UTC 9/28 23:00）
    expect(reminderTargetDate("2日前", new Date("2026-09-28T23:00:00Z"))).toBe(受け渡し日);
    // 前日の夜＝9/30 20:00（UTC 9/30 11:00）
    expect(reminderTargetDate("前日", new Date("2026-09-30T11:00:00Z"))).toBe(受け渡し日);
  });
});

describe("確定した受け渡し日", () => {
  const 候補 = [
    { date: "2026-09-14", time: "昼休み" },
    { date: "2026-09-15", time: "昼休み" },
  ];

  it("出品者が確定した候補の日付を返す", () => {
    expect(
      confirmedHandoverDate({ proposed_date: null, candidate_slots: 候補, selected_slot: 1 }),
    ).toBe("2026-09-15");
  });

  it("逆提案があればそちらを優先する（メールの文面と同じ順番）", () => {
    expect(
      confirmedHandoverDate({
        proposed_date: "2026-09-20",
        candidate_slots: 候補,
        selected_slot: 1,
      }),
    ).toBe("2026-09-20");
  });

  it("まだ決まっていなければ null（対象にしない）", () => {
    expect(
      confirmedHandoverDate({ proposed_date: null, candidate_slots: 候補, selected_slot: null }),
    ).toBeNull();
    expect(
      confirmedHandoverDate({ proposed_date: null, candidate_slots: null, selected_slot: 0 }),
    ).toBeNull();
  });

  it("選ばれた候補が無い番号を指していても落ちない", () => {
    expect(
      confirmedHandoverDate({ proposed_date: null, candidate_slots: 候補, selected_slot: 9 }),
    ).toBeNull();
  });

  it("日付の形が違うものは対象にしない", () => {
    expect(
      confirmedHandoverDate({ proposed_date: "来週", candidate_slots: null, selected_slot: null }),
    ).toBeNull();
  });
});
