// シナリオの実行順。前のシナリオが作ったもの（出品ID・予約ID）を次が使うため、
// 並べ替えるときは needs の依存に気をつけること。
import { T01, T02 } from "./01-listing.mjs";
import { T03, T04, T05 } from "./02-reservation.mjs";
import { T06, T07, T08, T09, T11 } from "./03-schedule.mjs";
import { T12, T12b } from "./04-card.mjs";
import { T10, T10b, T13, T14, T15, T17, T18, T19, T23, T24 } from "./05-payment.mjs";
import { T20, T20b, T21, T26, T27 } from "./06-cancel.mjs";

export const SCENARIOS = [
  // 出品
  T01, T02,
  // 購入予約
  T03, T04, T05,
  // 日程調整・取引確定
  T06, T11, T09, T07, T08,
  // カード登録
  T12, T12b,
  // QR発行
  T10, T10b, T24,
  // 決済
  T13, T14, T15, T17, T18, T19, T23,
  // キャンセルと歯止め
  T20, T20b, T21, T26, T27,
];
