import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_PROVIDER, getProvider, providerConfigError } from "@/lib/payment-provider";
import { loadStoredCustomer } from "@/lib/payment-provider/customers";

// 「今の決済会社で課金できるカードが登録済みか」をサーバー側で判定して返す。
//
// クライアントから payment_customers を直接読んで判定していたが、それだと
//  (1) 買い手のブラウザに cus_ / pm_ を渡す必要が出る
//  (2) 「どの決済会社のIDが入っていれば有効か」は環境変数で決まるので、DB だけでは判定できない
// の2点で行き詰まる。判定をサーバーに寄せることで、payment_customers の
// SELECT 権限をIDを含まない列だけに絞れるようになる。
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  // 設定不備でも 200 で返す。画面は「カード未登録」として扱えばよく、
  // ここで 500 を返すとチェックアウト画面全体が読み込めなくなる。
  if (providerConfigError()) {
    return NextResponse.json({ provider: PAYMENT_PROVIDER, cardReady: false });
  }

  const customer = await loadStoredCustomer(user.id);
  return NextResponse.json({
    provider: PAYMENT_PROVIDER,
    cardReady: getProvider().hasUsableCard(customer),
  });
}
