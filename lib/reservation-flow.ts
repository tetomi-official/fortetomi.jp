import type { ReservationStatus } from "./types";

// ===================================================
// 予約ステータスの遷移ルール
// ---------------------------------------------------
// これまで遷移の決まりはマイグレーションのSQLコメントにしか無く、コードにも
// DBにも歯止めが無かった。その結果「買い手が支払わずに完了と書き込める」状態に
// なっていた（docs/test-findings-2026-09-12.md の A-4）。
//
// ここを唯一の定義とし、
//   - 画面（app/mypage）はどのボタンを出すかの判断に使う
//   - DB は docs/supabase-migration-15-reservation-status-guard.sql の
//     トリガーで同じ表を強制する（画面を回避されても効くように）
// の二重で守る。**片方だけ直すと食い違うので、変えるときは必ず両方**。
// ===================================================

/** 誰がその変更を行うか。system は決済成立時のサーバー処理（service_role）。 */
export type Actor = "buyer" | "seller" | "system";

type Transition = {
  from: ReservationStatus;
  to: ReservationStatus;
  /** この遷移を実行できる人。 */
  actors: Actor[];
  /** 何が起きたときの遷移か（画面の文言やレビューの手がかり）。 */
  reason: string;
};

export const ALLOWED_TRANSITIONS: Transition[] = [
  { from: "申請中", to: "承認済み", actors: ["seller"], reason: "出品者が候補を確定した／そのまま承認した" },
  { from: "申請中", to: "日程調整中", actors: ["seller"], reason: "出品者が別の日程を逆提案した" },
  { from: "申請中", to: "キャンセル", actors: ["buyer", "seller"], reason: "買い手が取り下げた／出品者が断った" },
  { from: "日程調整中", to: "承認済み", actors: ["buyer"], reason: "買い手が逆提案を承諾した" },
  { from: "日程調整中", to: "キャンセル", actors: ["buyer", "seller"], reason: "どちらかが取りやめた" },
  // 受け渡し前の取りやめ。行けなくなった・別で手に入った、という場合の逃げ道。
  { from: "承認済み", to: "キャンセル", actors: ["buyer", "seller"], reason: "受け渡しの前に取りやめた" },
  // 完了はサーバーだけが書ける。人が書けると「支払わずに完了」が成立してしまう。
  { from: "承認済み", to: "完了", actors: ["system"], reason: "受け渡しのQRが読み取られ、決済が成立した" },
];

/**
 * その遷移を行ってよいか。
 * 同じステータスへの書き換えと、完了・キャンセルからの復活はすべて false。
 */
export function canTransition(
  from: ReservationStatus,
  to: ReservationStatus,
  actor: Actor,
): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS.some(
    (t) => t.from === from && t.to === to && t.actors.includes(actor),
  );
}

/** その人がいま取れる次のステータスの一覧（画面のボタンを出し分ける用）。 */
export function nextStatuses(from: ReservationStatus, actor: Actor): ReservationStatus[] {
  return ALLOWED_TRANSITIONS.filter((t) => t.from === from && t.actors.includes(actor)).map(
    (t) => t.to,
  );
}
