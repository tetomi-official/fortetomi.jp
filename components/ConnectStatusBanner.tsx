"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PAYMENT_PROVIDER } from "@/lib/payment-provider/config";

// 出品者への「受取口座の登録がまだ」ソフトな誘導。出品の作成自体は止めない
// （実際に止めるのは受け渡し課金の直前＝/api/payments/nonce・charge のサーバー側チェック）。
// PAY.jp では出品者ごとの口座登録が要らないので、Stripe のときだけ意味を持つ。
type ConnectState = "未作成" | "手続き中" | "審査中" | "利用可能" | "要対応";

async function fetchState(): Promise<ConnectState | null> {
  try {
    const res = await fetch("/api/payments/connect/status");
    const data = (await res.json().catch(() => null)) as { state?: ConnectState } | null;
    if (!res.ok || !data?.state) return null;
    return data.state;
  } catch {
    return null;
  }
}

export default function ConnectStatusBanner() {
  const [state, setState] = useState<ConnectState | null>(null);

  useEffect(() => {
    if (PAYMENT_PROVIDER !== "stripe") return;
    fetchState().then(setState);
  }, []);

  if (PAYMENT_PROVIDER !== "stripe") return null;
  if (!state || state === "利用可能") return null;

  const label = state === "審査中" ? "受取口座を審査中です" : "受取口座の登録が完了していません";

  return (
    <div className="form-card" style={{ borderColor: "#f59e0b", background: "#fffbeb" }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{label}</p>
      <p className="form-hint">
        受け渡し課金を受け取るには Stripe での受取口座の登録が必要です。
      </p>
      {state !== "審査中" && (
        <Link href="/sell/connect" className="btn-navy btn-full" style={{ marginTop: 12 }}>
          受取口座を登録する
        </Link>
      )}
    </div>
  );
}
