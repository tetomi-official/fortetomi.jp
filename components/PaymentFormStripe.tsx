"use client";

import { useEffect, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

// 支払いカードの登録フォーム（Stripe 版）。
//
// PAY.jp 版（PaymentFormPayjp）と違い、カード名義・メールの入力欄は無い。
// PaymentElement が必要な項目を自分で出すため。
//
// 3Dセキュアはサーバー側で SetupIntent に対して要求している
// （app/api/payments/setup-intent）。confirmSetup は redirect:"if_required" で
// 呼ぶため、多くの場合はモーダル内で完結するが、カード発行会社によっては
// 銀行のページへ実際にリダイレクトされることがある。そのため、このページに
// 戻ってきたとき（URLに setup_intent が付いている）の処理も用意する。

let stripePromise: Promise<StripeJs | null> | null = null;
function getStripePromise(): Promise<StripeJs | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromise = key ? loadStripe(key) : Promise.resolve(null);
  }
  return stripePromise;
}

type FinalizeResult = { ok: true } | { ok: false; error: string };

type SetupIntentResult = { ok: true; clientSecret: string } | { ok: false; error: string };

// コンポーネントの外に置く。effect の中から直接 setState する関数を呼ぶと、
// ESLint（react-hooks/set-state-in-effect）が「effect内で直接 setState している」
// とみなして警告する。外部関数の .then() コールバック内で setState するのは
// 許容される書き方なので、フェッチ処理そのものは純粋な関数として外に出す。
async function fetchSetupIntentClientSecret(): Promise<SetupIntentResult> {
  try {
    const res = await fetch("/api/payments/setup-intent", { method: "POST" });
    const data = (await res.json().catch(() => null)) as
      | { clientSecret?: string; error?: string }
      | null;
    if (!res.ok || !data?.clientSecret) {
      return { ok: false, error: data?.error ?? "決済フォームを初期化できませんでした" };
    }
    return { ok: true, clientSecret: data.clientSecret };
  } catch {
    return { ok: false, error: "通信エラーが発生しました" };
  }
}

async function finalizeRegistration(setupIntentId: string): Promise<FinalizeResult> {
  try {
    const res = await fetch("/api/payments/register-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "stripe", setupIntentId }),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error ?? "カードの登録に失敗しました" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "通信エラーが発生しました" };
  }
}

function StripeSetupForm({
  submitLabel,
  onSucceeded,
}: {
  submitLabel: string;
  onSucceeded: (setupIntentId: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "入力内容をご確認ください");
      setSubmitting(false);
      return;
    }

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}${window.location.pathname}`,
      },
      redirect: "if_required",
    });
    if (confirmError) {
      setError(confirmError.message ?? "カードの確認に失敗しました");
      setSubmitting(false);
      return;
    }
    if (!setupIntent || setupIntent.status !== "succeeded") {
      setError("3Dセキュア認証が完了しませんでした。もう一度お試しください。");
      setSubmitting(false);
      return;
    }
    onSucceeded(setupIntent.id);
  }

  return (
    <div className="form-card">
      <h2>支払いカードの登録</h2>
      <div className="form-group">
        <PaymentElement options={{ layout: "tabs" }} />
        <p className="form-hint">
          テストカード例：4242 4242 4242 4242 / 任意の未来の有効期限 / 任意のCVC
          <br />
          必要な場合、カード会社の本人確認（3Dセキュア）画面が表示されます。
        </p>
      </div>
      {error && <p style={{ color: "#c0392b", fontSize: 14, marginBottom: 12 }}>{error}</p>}
      <button
        className="btn-navy btn-full"
        onClick={handleSubmit}
        disabled={!stripe || !elements || submitting}
      >
        {submitting ? "登録中…" : submitLabel}
      </button>
    </div>
  );
}

// 銀行のページへ実際にリダイレクトされ、このページに戻ってきたかを読み取る。
// レンダーの最中（useState の初期値）で一度だけ読み、結果を state に固定する。
// ここでは window.history には触れない（それは effect 側の役目）。
function readRedirectReturn(): { setupIntentId: string; status: string } | null {
  const params = new URLSearchParams(window.location.search);
  const setupIntentId = params.get("setup_intent");
  const status = params.get("redirect_status");
  return setupIntentId && status ? { setupIntentId, status } : null;
}

export default function PaymentFormStripe({
  onRegistered,
  submitLabel = "カードを登録する",
}: {
  onRegistered?: () => void;
  submitLabel?: string;
  defaultEmail?: string;
}) {
  const [redirectReturn] = useState(readRedirectReturn);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      return "決済の設定が未完了です（NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY 未設定）";
    }
    if (redirectReturn && redirectReturn.status !== "succeeded") {
      return "3Dセキュア認証が完了しませんでした。もう一度お試しください。";
    }
    return null;
  });
  const [done, setDone] = useState(false);

  async function handleSucceeded(setupIntentId: string) {
    const result = await finalizeRegistration(setupIntentId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
    onRegistered?.();
  }

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) return;

    if (redirectReturn) {
      // URLからパラメータを取り除く（再読み込みで二重処理させない）。
      // 失敗ケースの表示は error の初期値で済んでいるので、ここでは何もしない。
      window.history.replaceState(null, "", window.location.pathname);
      if (redirectReturn.status === "succeeded") {
        finalizeRegistration(redirectReturn.setupIntentId).then((result) => {
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setDone(true);
          onRegistered?.();
        });
      }
      return;
    }

    fetchSetupIntentClientSecret().then((result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setClientSecret(result.clientSecret);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (done) {
    return (
      <div className="form-card">
        <h2>カードを登録しました</h2>
        <p className="form-hint">
          受け渡し時に、このカードへ自動で決済されます。QRコードを出品者に見せてください。
        </p>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="form-card">
        <h2>支払いカードの登録</h2>
        {error ? (
          <p style={{ color: "#c0392b", fontSize: 14 }}>{error}</p>
        ) : (
          <p className="form-hint">読み込み中…</p>
        )}
      </div>
    );
  }

  return (
    <Elements stripe={getStripePromise()} options={{ clientSecret, locale: "ja" }}>
      <StripeSetupForm submitLabel={submitLabel} onSucceeded={handleSucceeded} />
    </Elements>
  );
}
