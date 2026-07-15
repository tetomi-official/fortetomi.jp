// ===================================================
// 在籍（大学メール）再認証の有効期限ユーティリティ
// - 卒業生は大学メール（@g.chuo-u.ac.jp）が失効するため、年度切替（毎年4月1日）で
//   在籍確認を一律失効させ、再認証を要求する。
// - 「在籍有効」の判定は profiles.enrollment_valid_until > now() の一点に集約し、
//   RLS（docs/supabase-setup.sql の is_enrollment_active）とフロント双方で参照する。
// - フロント表示とサーバールート（再認証確定）でこの関数を共用する。
// ===================================================

// 日本標準時（UTC+9）。年度境界は JST の 4/1 00:00 を基準にする。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 指定年の「4月1日 00:00 JST」を UTC ミリ秒で返す。
function april1JstUtcMs(year: number): number {
  return Date.UTC(year, 3, 1, 0, 0, 0, 0) - JST_OFFSET_MS;
}

/**
 * now より後の最初の「4月1日 00:00 JST」を返す（= 現在の年度末 = 次の再認証期限）。
 * 例: 2026-02 に認証 → 2026-04-01 まで有効（年度2025末）。
 *     2026-06 に認証 → 2027-04-01 まで有効（年度2026末）。
 */
export function nextAcademicYearBoundary(now: Date): Date {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const year = jst.getUTCFullYear();
  let boundaryMs = april1JstUtcMs(year);
  if (now.getTime() >= boundaryMs) {
    boundaryMs = april1JstUtcMs(year + 1);
  }
  return new Date(boundaryMs);
}

/**
 * 大学メールのローカル部先頭「英字1文字＋2桁」から入学年（西暦）を読み取る。
 * 例: a24.p4wh@g.chuo-u.ac.jp → 2024。判別できなければ null。
 * ※ 在籍期間の根拠になるため、想定外フォーマットは呼び出し側で登録拒否する。
 */
export function parseEntranceYear(email: string | null | undefined): number | null {
  if (!email) return null;
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  const m = /^[a-z](\d{2})/.exec(local);
  if (!m) return null;
  return 2000 + Number(m[1]);
}

/**
 * 入学年から在籍有効期限を返す（基本4年制）。
 * = 入学年＋4年の「4月1日 00:00 JST」（＝卒業年の3月いっぱいまで在籍）。
 * 例: 2024入学 → 2028-04-01。休学・留年による延長は将来対応。
 */
export function graduationBoundary(entranceYear: number): Date {
  return new Date(april1JstUtcMs(entranceYear + 4));
}

/** 在籍が現在有効か（出品・購入が許可されるか）。null/失効は false。 */
export function isEnrollmentActive(validUntil: string | null | undefined): boolean {
  if (!validUntil) return false;
  const t = new Date(validUntil).getTime();
  return Number.isFinite(t) && t > Date.now();
}

/** 有効期限を「2026年4月1日」のような日本語表記にする（UI 表示用）。 */
export function formatEnrollmentDeadline(validUntil: string | null | undefined): string {
  if (!validUntil) return "—";
  const d = new Date(validUntil);
  if (!Number.isFinite(d.getTime())) return "—";
  const jst = new Date(d.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCFullYear()}年${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;
}
