"use client";

import { useEffect, useRef, useState } from "react";

// 支払いカードの登録フォーム（PB-036 Phase 1 / Phase 2: EMV 3-Dセキュア必須化）。
// カード入力〜トークン化はすべて payjp.js v2（クライアント）で完結し、カード番号は自社サーバーを通らない。
//
// 3Dセキュア（PDFセキュリティ要件・EMV 3DS 義務化対応）:
//  - カード登録の「この瞬間」に買い手本人のブラウザで 3DS 認証を完了させる。
//    対面のQR受け渡し時は出品者操作＝買い手不在なので 3DS はできない。だから登録時に済ませ、
//    以後は 3DS 認証済みの保存カード（Customer）へ課金する設計（continuous/MIT 相当）。
//  - iframe ワークフローを使い、createToken(three_d_secure:true) の中で 3DS 画面を表示・完結させる
//    （サブウィンドウ型と違いポップアップブロックの影響を受けず、スマホでも安定）。
//  - createToken には 3DS 要件として「名義」と「メール（または電話）」が必須。
//  - サーバー(register-card)側でもトークンの three_d_secure_status を再検証し、未認証トークンでの
//    カード登録を拒否する（クライアントだけの検証は迂回されうるため）。

const PAYJP_SCRIPT_SRC = "https://js.pay.jp/v2/pay.js";

type PayjpCardElement = { mount: (selector: string) => void };
type PayjpElements = { create: (type: "card") => PayjpCardElement };
type ThreeDSecureStatus = "unverified" | "verified" | "attempted" | "error";
type PayjpTokenResponse = {
  id?: string;
  card?: { three_d_secure_status?: ThreeDSecureStatus };
  error?: { message?: string };
};
type CreateTokenData = {
  three_d_secure?: boolean;
  card?: { name?: string; email?: string; phone?: string };
};
type PayjpInstance = {
  elements: () => PayjpElements;
  createToken: (el: PayjpCardElement, data?: CreateTokenData) => Promise<PayjpTokenResponse>;
  // サブウィンドウ型フォールバック用。iframe 型では通常不要。
  openThreeDSecureDialog?: (
    tokenId: string,
    options?: { timeout?: number },
  ) => Promise<PayjpTokenResponse | void>;
};
type PayjpConstructorOptions = { threeDSecureWorkflow?: "subwindow" | "iframe" | "redirect" };
declare global {
  interface Window {
    Payjp?: (publicKey: string, options?: PayjpConstructorOptions) => PayjpInstance;
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
  defaultEmail = "",
}: {
  onRegistered?: () => void;
  submitLabel?: string;
  defaultEmail?: string;
}) {
  const payjpRef = useRef<PayjpInstance | null>(null);
  const cardElementRef = useRef<PayjpCardElement | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
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
        // 3DS は iframe 型で inline 表示（ポップアップブロック回避）。
        const payjp = window.Payjp(publicKey, { threeDSecureWorkflow: "iframe" });
        const elements = payjp.elements();
        const cardElement = elements.create("card");
        cardElement.mount("#payjp-card");
        payjpRef.current = payjp;
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
    const payjp = payjpRef.current;
    const cardElement = cardElementRef.current;
    if (!payjp || !cardElement) return;
    if (!name.trim()) {
      setError("カード名義を入力してください（3Dセキュア認証に必要です）");
      return;
    }
    if (!email.trim()) {
      setError("メールアドレスを入力してください（3Dセキュア認証に必要です）");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // 3DS を要求してトークン化。iframe 型なら createToken 内で 3DS 画面が完結する。
      let result = await payjp.createToken(cardElement, {
        three_d_secure: true,
        card: { name: name.trim(), email: email.trim() },
      });
      if (result.error || !result.id) {
        setError(result.error?.message ?? "カード情報を確認してください");
        return;
      }
      // iframe で完結しなかった場合のフォールバック（サブウィンドウ型ダイアログ）。
      if (result.card?.three_d_secure_status === "unverified" && payjp.openThreeDSecureDialog) {
        const after = await payjp.openThreeDSecureDialog(result.id);
        if (after && typeof after === "object" && "card" in after) {
          result = after as PayjpTokenResponse;
        }
      }
      const status = result.card?.three_d_secure_status;
      if (status !== "verified" && status !== "attempted") {
        setError("3Dセキュア認証が完了しませんでした。もう一度お試しください。");
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
        <label htmlFor="payjp-name">カード名義</label>
        <input
          id="payjp-name"
          type="text"
          autoComplete="cc-name"
          placeholder="TARO YAMADA"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="payjp-email">メールアドレス</label>
        <input
          id="payjp-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
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
          <br />
          登録時に 3Dセキュア認証（カード会社の本人確認）が表示されます。
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
