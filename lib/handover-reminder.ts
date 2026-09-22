import type { CandidateSlot, ReminderKind } from "@/lib/types";

// ===================================================
// 受け渡しリマインドの日付の計算（#58）
// ---------------------------------------------------
// ここに置くのは「日付の文字列を受け取って日付の文字列を返すだけ」の関数。
// DB もメールも触らないので、そのまま単体テストできる
// （lib/__tests__/handover-reminder.test.ts）。
//
// 受け渡し日は candidate_slots / proposed_date に YYYY-MM-DD の文字列で入っている。
// 時刻は「昼休み」のような言葉なので、比べるのは日付だけでよい。
//
// サーバーの時計は UTC（Vercel も GitHub Actions も）。日本時間の夜に走る回は、
// UTC で見ると前日になる。素の Date で計算すると1日ずれるので、必ず
// 日本時間の「今日」を出してから足し算する。
// ===================================================

/** その回が「何日先の受け渡し」を対象にするか。 */
export const REMINDER_DAYS_AHEAD: Record<ReminderKind, number> = {
  "2日前": 2,
  前日: 1,
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 日本時間の「今日」を YYYY-MM-DD で返す。 */
export function todayInJapan(now: Date = new Date()): string {
  // en-CA は YYYY-MM-DD で出る。自前で 9 時間足すより取り違えが少ない。
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** YYYY-MM-DD に日数を足す。月末・年末をまたいでもずれない。 */
export function addDays(date: string, days: number): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`日付の形が違います: ${date}`);
  // UTC で組み立てて UTC で読み出す。時差の影響を受けない。
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** その回が対象にする受け渡し日（YYYY-MM-DD）。 */
export function reminderTargetDate(kind: ReminderKind, now: Date = new Date()): string {
  return addDays(todayInJapan(now), REMINDER_DAYS_AHEAD[kind]);
}

/** 予約のうち、受け渡し日の判定に要る分だけ。 */
export type HandoverScheduleFields = {
  proposed_date: string | null;
  candidate_slots: CandidateSlot[] | null;
  selected_slot: number | null;
};

/**
 * 確定した受け渡し日（YYYY-MM-DD）。決まっていなければ null。
 *
 * 出品者の逆提案を買い手が承諾した場合は proposed_date が入るので、そちらを先に見る
 * （lib/mail-templates.ts の「確定した日時」と同じ順番）。
 */
export function confirmedHandoverDate(r: HandoverScheduleFields): string | null {
  const 候補 =
    r.proposed_date ??
    (typeof r.selected_slot === "number" ? r.candidate_slots?.[r.selected_slot]?.date : undefined);
  return 候補 && DATE_RE.test(候補) ? 候補 : null;
}
