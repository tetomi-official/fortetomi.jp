"use client";

import { useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";

// 受け渡しの場でカード会社が本人認証（3DS）を求めたときの、買い手側の復旧画面。
//
// 課金は出品者がQRを読み取った瞬間に走る＝買い手は端末を操作していない。
// そこで認証が要求されると、そのままでは詰む。ただし買い手は目の前にいるので、
// 自分の端末で認証を済ませればその場で完了できる。ここはそのための導線。
//
// client secret はサーバーが「本人認証待ちの予約」に限って発行する。
// 保存済みカードや顧客IDはブラウザに渡さない。

let stripePromise: Promise<StripeJs | null> | null = null;
function getStripePromise(): Promise<StripeJs | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = key ? loadStripe(key) : Promise.resolve(null);
  }
  return stripePromise;
}

type Phase = "idle" | "running" | "done" | "error";

export default function PaymentAuthPrompt({
  reservationId,
  onPaid,
}: {
  reservationId: string;
  onPaid?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function authenticate() {
    setPhase("running");
    setError(null);
    try {
      // 1) 認証用の client secret をもらう（本人認証待ちの予約のときだけ発行される）
      const res = await fetch("/api/payments/stripe/authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
      });
      const data = (await res.json().catch(() => null)) as {
        clientSecret?: string;
        alreadySucceeded?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !data) {
        setError(data?.error ?? "認証を開始できませんでした");
        setPhase("error");
        return;
      }
      // 別経路で既に完了していた場合は、記録の確定だけ行う。
      if (!data.alreadySucceeded) {
        if (!data.clientSecret) {
          setError("認証を開始できませんでした");
          setPhase("error");
          return;
        }
        const stripe = await getStripePromise();
        if (!stripe) {
          setError("決済の設定が未完了です");
          setPhase("error");
          return;
        }
        // 2) 買い手の端末でカード会社の認証画面を出す
        const { error: actionError } = await stripe.handleNextAction({
          clientSecret: data.clientSecret,
        });
        if (actionError) {
          setError(actionError.message ?? "認証が完了しませんでした");
          setPhase("error");
          return;
        }
      }

      // 3) 成立をサーバー側で確定する。Webhook を待たずにその場で完了させるため。
      const confirm = await fetch("/api/payments/stripe/confirm-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
      });
      const result = (await confirm.json().catch(() => null)) as {
        paid?: boolean;
        error?: string;
      } | null;
      if (!confirm.ok || !result?.paid) {
        setError(result?.error ?? "認証は完了しましたが、決済を確定できませんでした。");
        setPhase("error");
        return;
      }
      setPhase("done");
      onPaid?.();
    } catch {
      setError("通信エラーが発生しました");
      setPhase("error");
    }
  }

  if (phase === "done") {
    return (
      <div className="form-card">
        <h2>決済が完了しました</h2>
        <p className="form-hint">お待たせしました。受け取りは完了です。</p>
      </div>
    );
  }

  return (
    <div className="form-card" style={{ borderColor: "#f59e0b", background: "#fffbeb" }}>
      <h2>カード会社の本人確認が必要です</h2>
      <p className="form-hint">
        安全のため、カード会社が追加の確認を求めています。下のボタンから確認を完了すると、
        その場で決済が終わります。
      </p>
      {error && <p style={{ color: "#c0392b", fontSize: 14, margin: "12px 0" }}>{error}</p>}
      <button
        className="btn-navy btn-full"
        style={{ marginTop: 12 }}
        onClick={authenticate}
        disabled={phase === "running"}
      >
        {phase === "running" ? "確認中…" : "本人確認を行う"}
      </button>
    </div>
  );
}
