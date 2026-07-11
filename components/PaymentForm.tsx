"use client";

import { useEffect, useRef, useState } from "react";

// 支払いカードの登録フォーム（PB-036 Phase 1）。
// カード入力〜トークン化はすべて payjp.js v2（クライアント）で完結し、カード番号は自社サーバーを通らない。
// サーバーには token だけ送り、PAY.jp Customer を作成して payment_customers に保存する。
// 実際の課金は対面のQR受け渡し時に、この保存済みカードへ行う（PaymentQR / charge API）。

const PAYJP_SCRIPT_SRC = "https://js.pay.jp/v2/pay.js";

type PayjpCardElement = { mount: (selector: string) => void };
type PayjpElements = { create: (type: "card") => PayjpCardElement };
type PayjpTokenResponse = { id?: string; error?: { message?: string } };
type PayjpInstance = {
  elements: () => PayjpElements;
  createToken: (el: PayjpCardElement) => Promise<PayjpTokenResponse>;
};
declare global {
  interface Window {
    Payjp?: (publicKey: string) => PayjpInstance;
  }
}

function loadPayjpScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Payjp) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PAYJP_SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script error")));
      return;
    }
    const script = document.createElement("script");
    script.src = PAYJP_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("script error"));
    document.head.appendChild(script);
  });
}

export default function PaymentForm({
  onRegistered,
  submitLabel = "カードを登録する",
}: {
  onRegistered?: () => void;
  submitLabel?: string;
}) {
  const cardElementRef = useRef<PayjpCardElement | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    process.env.NEXT_PUBLIC_PAYJP_PUBLIC_KEY
      ? null
      : "決済の設定が未完了です（NEXT_PUBLIC_PAYJP_PUBLIC_KEY 未設定）",
  );
  const [done, setDone] = useState(false);

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_PAYJP_PUBLIC_KEY;
    if (!publicKey) return;
    let cancelled = false;
    loadPayjpScript()
      .then(() => {
        if (cancelled || !window.Payjp) return;
        const payjp = window.Payjp(publicKey);
        const elements = payjp.elements();
        const cardElement = elements.create("card");
        cardElement.mount("#payjp-card");
        cardElementRef.current = cardElement;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("決済フォームを読み込めませんでした");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit() {
    const publicKey = process.env.NEXT_PUBLIC_PAYJP_PUBLIC_KEY;
    const cardElement = cardElementRef.current;
    if (!publicKey || !cardElement || !window.Payjp) return;
    setSubmitting(true);
    setError(null);
    try {
      const payjp = window.Payjp(publicKey);
      const result = await payjp.createToken(cardElement);
      if (result.error || !result.id) {
        setError(result.error?.message ?? "カード情報を確認してください");
        return;
      }
      const res = await fetch("/api/payments/register-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: result.id }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "カードの登録に失敗しました");
        return;
      }
      setDone(true);
      onRegistered?.();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }

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

  return (
    <div className="form-card">
      <h2>支払いカードの登録</h2>
      <div className="form-group">
        <label>カード情報</label>
        {/* payjp.js がこの要素内に安全なカード入力欄（iframe）を描画する */}
        <div
          id="payjp-card"
          style={{
            border: "1px solid var(--border, #ddd)",
            borderRadius: 8,
            padding: "12px 14px",
          }}
        />
        <p className="form-hint">
          テストカード例：4242 4242 4242 4242 / 任意の未来の有効期限 / 任意のCVC
        </p>
      </div>
      {error && <p style={{ color: "#c0392b", fontSize: 14, marginBottom: 12 }}>{error}</p>}
      <button
        className="btn-navy btn-full"
        onClick={handleSubmit}
        disabled={!ready || submitting}
      >
        {submitting ? "登録中…" : submitLabel}
      </button>
    </div>
  );
}
