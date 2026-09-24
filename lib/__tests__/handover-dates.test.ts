import { afterEach, describe, expect, it, vi } from "vitest";
import { HANDOVER_TIME_LABEL, upcomingHandoverDates } from "@/lib/constants";

// ===================================================
// 受け渡し候補日（T09）
//
// 買い手が選べるのは「今日から7日ぶんの日付」だけ。時刻は昼休み固定。
// 月末・年末をまたぐときに日付がずれないかを見る（UTC変換で1日ずれる事故が起きやすい）。
// ===================================================

afterEach(() => {
  vi.useRealTimers();
});

/** 指定の日時を「今」として固定する（ローカル時刻）。 */
function 今は(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe("受け渡し候補日", () => {
  it("既定で7日ぶん、重複なし、YYYY-MM-DD の形", () => {
    今は("2026-09-12T10:00:00");
    const days = upcomingHandoverDates();
    expect(days).toHaveLength(7);
    expect(new Set(days.map((d) => d.value)).size).toBe(7);
    for (const d of days) expect(d.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("先頭は今日", () => {
    今は("2026-09-12T23:30:00");
    expect(upcomingHandoverDates()[0].value).toBe("2026-09-12");
  });

  it("月をまたいでもずれない", () => {
    今は("2026-09-29T09:00:00");
    expect(upcomingHandoverDates(4).map((d) => d.value)).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("年をまたいでもずれない", () => {
    今は("2026-12-30T09:00:00");
    expect(upcomingHandoverDates(3).map((d) => d.value)).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
    ]);
  });

  it("うるう年の2月29日をまたげる", () => {
    今は("2028-02-28T09:00:00");
    expect(upcomingHandoverDates(3).map((d) => d.value)).toEqual([
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });

  it("ラベルは 月/日（曜日）", () => {
    今は("2026-09-12T09:00:00"); // 土曜
    expect(upcomingHandoverDates(1)[0].label).toBe("9/12（土）");
  });

  it("受け渡し時刻は昼休み固定", () => {
    expect(HANDOVER_TIME_LABEL).toBe("昼休み");
  });
});
