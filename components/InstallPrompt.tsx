"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "tetomi-install-dismissed";

// beforeinstallprompt の最小型（型定義が lib.dom に無いため）。
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari 独自
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// 「ホーム画面に追加」を促す導線。
//  - Android/PC(Chrome/Edge)：beforeinstallprompt を捕捉し「アプリを追加」ボタンを表示。
//  - iOS Safari：自動プロンプト不可のため、共有→ホーム画面に追加 の手順を案内。
//  - 既に standalone 起動なら何も出さない。閉じると localStorage で再表示を抑制。
export default function InstallPrompt() {
  const [mode, setMode] = useState<"none" | "button" | "ios">("none");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* localStorage 不可でも続行 */
    }

    const onBip = (e: Event) => {
      e.preventDefault(); // 既定のミニインフォバーを抑止して自前ボタンに集約
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("button");
    };
    const onInstalled = () => {
      setMode("none");
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);

    // iOS は beforeinstallprompt が来ないので、iOS Safari なら案内を出す。
    // （effect 内での直接 setState を避けるためラッパー関数経由で呼ぶ）
    const showIosHintIfNeeded = () => {
      if (isIos()) setMode("ios");
    };
    showIosHintIfNeeded();

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setMode("none");
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* noop */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    setMode("none");
  };

  if (mode === "none") return null;

  return (
    <div
      role="dialog"
      aria-label="アプリとして追加"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: "calc(12px + env(safe-area-inset-bottom))",
        zIndex: 600,
        maxWidth: 520,
        margin: "0 auto",
        background: "#fff",
        border: "1px solid #e3e8ee",
        borderRadius: 14,
        boxShadow: "0 8px 32px rgba(20,49,74,0.18)",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        aria-hidden
        style={{
          flex: "0 0 auto",
          width: 40,
          height: 40,
          borderRadius: 9,
          background: "#14314A",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: "0.04em",
        }}
      >
        T
      </div>

      <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.6, color: "#14314A" }}>
        {mode === "button" ? (
          <span>ホーム画面に追加すると、アプリのように使えます。</span>
        ) : (
          <span>
            アプリのように使うには、下の<strong>共有ボタン</strong>から
            <strong>「ホーム画面に追加」</strong>を選んでください。
          </span>
        )}
      </div>

      {mode === "button" && (
        <button
          type="button"
          onClick={install}
          style={{
            flex: "0 0 auto",
            background: "#14314A",
            color: "#fff",
            border: "none",
            borderRadius: 999,
            padding: "8px 16px",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          アプリを追加
        </button>
      )}

      <button
        type="button"
        onClick={dismiss}
        aria-label="閉じる"
        style={{
          flex: "0 0 auto",
          background: "transparent",
          border: "none",
          color: "#7a93a5",
          fontSize: 18,
          lineHeight: 1,
          cursor: "pointer",
          padding: 4,
        }}
      >
        ×
      </button>
    </div>
  );
}
