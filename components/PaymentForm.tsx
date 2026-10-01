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
const PaymentFormStripe = dynamic(() => import("./PaymentFormStripe"), { ssr: false });

export type PaymentFormProps = {
  onRegistered?: () => void;
  submitLabel?: string;
  defaultEmail?: string;
};

export default function PaymentForm(props: PaymentFormProps) {
  if (PAYMENT_PROVIDER === "stripe") {
    return <PaymentFormStripe {...props} />;
  }
  return <PaymentFormPayjp {...props} />;
}
