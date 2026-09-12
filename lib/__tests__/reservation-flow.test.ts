import { describe, expect, it } from "vitest";
import type { ReservationStatus } from "@/lib/types";

// ===================================================
// 予約ステータスの遷移ルール（T20 / §3-4）
//
// ★このテストは今は落ちる。落ちるのが正しい。★
//
// 現状 reservations.status には CHECK 制約も遷移チェックも無く、
// updateReservationStatus(id, status) はどの値でも書けてしまう。
// つまり「買い手が支払わずに 完了 と書く」ができる状態にある。
//
// あるべき姿を先に書いておき、lib/reservation-flow.ts を作って
// DBトリガーと画面の両方がこの表を見るようになったら緑に変わる。
// ===================================================

type Actor = "buyer" | "seller" | "system";

/** 期待する遷移表。[現在, 次, 実行できる人] */
const 許される遷移: [ReservationStatus, ReservationStatus, Actor[]][] = [
  ["申請中", "承認済み", ["seller"]], // 候補を選んで確定 / そのまま承認
  ["申請中", "日程調整中", ["seller"]], // 別日程を逆提案
  ["申請中", "キャンセル", ["buyer", "seller"]], // 取り下げ / 断る
  ["日程調整中", "承認済み", ["buyer"]], // 逆提案を承諾
  ["日程調整中", "キャンセル", ["buyer", "seller"]],
  ["承認済み", "キャンセル", ["buyer", "seller"]], // 受け渡し前のキャンセル（今は画面に無い）
  ["承認済み", "完了", ["system"]], // QR読み取りで課金が成立したときだけ
];

/** 絶対に通してはいけない遷移。 */
const 許されない遷移: [ReservationStatus, ReservationStatus, Actor][] = [
  ["申請中", "完了", "buyer"], // 支払わずに完了にする
  ["申請中", "完了", "seller"],
  ["承認済み", "完了", "buyer"], // ここが一番危ない
  ["承認済み", "完了", "seller"],
  ["日程調整中", "完了", "buyer"],
  ["申請中", "承認済み", "buyer"], // 買い手が自分で承認する
  ["申請中", "日程調整中", "buyer"], // 逆提案は出品者のみ
  ["完了", "キャンセル", "buyer"], // 決済後は返金の手続きが要る
  ["完了", "承認済み", "seller"],
  ["キャンセル", "承認済み", "seller"], // 断ったものを勝手に復活させる
  ["キャンセル", "完了", "system"],
];

async function 遷移ルールを読む() {
  try {
    return (await import("@/lib/reservation-flow")) as {
      canTransition: (from: ReservationStatus, to: ReservationStatus, actor: Actor) => boolean;
    };
  } catch {
    throw new Error(
      "【未実装】lib/reservation-flow.ts がまだ無い。\n" +
        "予約ステータスの遷移ルールがコードのどこにも無く、マイグレーションのSQLコメントにしか書かれていない。\n" +
        "そのため updateReservationStatus() で誰でも任意の値（完了を含む）を書ける。",
    );
  }
}

describe("予約ステータスの遷移", () => {
  it("正しい遷移は通る", async () => {
    const { canTransition } = await 遷移ルールを読む();
    for (const [from, to, actors] of 許される遷移) {
      for (const actor of actors) {
        expect(canTransition(from, to, actor), `通るべき: ${from} → ${to} (${actor})`).toBe(true);
      }
    }
  });

  it("支払わずに「完了」にはできない", async () => {
    const { canTransition } = await 遷移ルールを読む();
    for (const [from, to, actor] of 許されない遷移) {
      expect(canTransition(from, to, actor), `止めるべき: ${from} → ${to} (${actor})`).toBe(false);
    }
  });

  it("同じステータスへの書き換えは何もしない扱い", async () => {
    const { canTransition } = await 遷移ルールを読む();
    for (const s of ["申請中", "日程調整中", "承認済み", "完了", "キャンセル"] as ReservationStatus[]) {
      expect(canTransition(s, s, "seller"), `同一遷移は止める: ${s}`).toBe(false);
    }
  });
});
