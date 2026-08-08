"use client";

import dynamic from "next/dynamic";
import { PAYMENT_PROVIDER } from "@/lib/payment-provider/config";

// 支払いカード登録フォームの振り分け役。
//
// 中身は決済会社ごとに完全に別のコンポーネントにしてある。1つのファイルで分岐すると
// payjp.js と Stripe.js の両方の読み込み処理が同居し、useEffect のライフサイクルも
// 二重になって壊れやすい。呼び出し側（app/checkout/[reservationId]）から見た props は
// 変わらないので、この振り分けは呼び出し側に影響しない。
//
// next/dynamic + ssr:false で読むので、使わない側の決済SDKはブラウザに届かない。

const PaymentFormPayjp = dynamic(() => import("./PaymentFormPayjp"), { ssr: false });

export type PaymentFormProps = {
  onRegistered?: () => void;
  submitLabel?: string;
  defaultEmail?: string;
};

export default function PaymentForm(props: PaymentFormProps) {
  if (PAYMENT_PROVIDER === "stripe") {
    // Stripe 版は S2 で追加する。設定だけ先に切り替えられた場合に、
    // PAY.jp のフォームを黙って出さないよう明示的に止める。
    return (
      <div className="form-card">
        <h2>支払いカードの登録</h2>
        <p className="form-hint">
          決済の設定が未完了です。しばらくしてからお試しください。
        </p>
      </div>
    );
  }
  return <PaymentFormPayjp {...props} />;
}
