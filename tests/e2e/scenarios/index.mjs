// シナリオの実行順。前のシナリオが作ったもの（出品ID・予約ID）を次が使うため、
// 並べ替えるときは needs の依存に気をつけること。
import { T01, T02 } from "./01-listing.mjs";
import { T03, T04, T04c, T05 } from "./02-reservation.mjs";
import { T06, T07, T08, T09, T11 } from "./03-schedule.mjs";
import { T12, T12b, T12c } from "./04-card.mjs";
import { T10, T10b, T13, T13c, T14, T15, T17, T18, T19, T23, T24 } from "./05-payment.mjs";
import { T20, T20b, T21, T26, T27 } from "./06-cancel.mjs";
import { T28, T29 } from "./07-enrollment.mjs";
import { T30, T31 } from "./08-scan.mjs";
import { T32, T33 } from "./09-mail.mjs";
import { T34, T35, T36 } from "./10-stripe.mjs";
import { T37, T38 } from "./11-mobile.mjs";
import { T39 } from "./12-mobile-sweep.mjs";

export const SCENARIOS = [
  // 出品
  T01, T02,
  // 購入予約
  T03, T04, T04c, T05,
  // 日程調整・取引確定
  T06, T11, T09, T07, T08,
  // カード登録
  T12, T12b,
  // QR発行
  T10, T10b, T24,
  // 決済
  T13, T14, T15, T17, T18, T19, T23,
  // カメラでQRを読み取って決済（偽のカメラで本物の読み取り画面を通す）
  T30, T31,
  // 通知メール（開発サーバーが書き出したメールを読む）
  T32, T33,
  // Stripe まわり（返金・出品者向け画面・受取口座の登録の再開）
  T34, T35, T36,
  // スマホ幅での見え方と二度押し
  T37, T38,
  // スマホ幅（375px）で主要画面を巡回（Tailwind 移行のガードレール）
  T39,
  // キャンセルと歯止め
  T20, T20b, T21, T26, T27,
  // 在籍期限切れ
  T28, T29,
  // 断られるカード（separate: 名前を指定したときだけ流す）。
  // 同じブラウザで断られるカードを何度も試すと、Stripe の「カードの総当たり対策」が働いて
  // カード入力欄が出なくなることがある。全体の実行とは分け、新しいブラウザで単独で流す：
  //   npm run test:e2e -- T12c T13c
  // 続けて何度も流すと同じ理由で落ちることがあるので、そのときは少し時間をおく。
  T12c, T13c,
];
