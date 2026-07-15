"use client";

import { useEffect } from "react";

// Service Worker を登録する（PWA インストール可能化の前提）。
// 本番のみ登録し、開発中は HMR と干渉しないよう既存 SW を解除する。
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // 開発中に本番の SW が残っていると混乱するので掃除しておく。
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      return;
    }

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("[sw] registration failed:", err);
      });
    };
    // ページ読み込み後に登録して初期表示を邪魔しない。
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
