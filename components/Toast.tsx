"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastType = "" | "success" | "error" | "warning";

interface ToastContextValue {
  showToast: (msg: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_BG: Record<ToastType, string> = {
  "": "bg-navy",
  success: "bg-ok-strong",
  error: "bg-navy-mid",
  warning: "bg-warn-strong",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState("");
  const [type, setType] = useState<ToastType>("");
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((m: string, t: ToastType = "") => {
    setMsg(m);
    setType(t);
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    // エラー/警告は見落とすと原因切り分けができないため長めに表示する。
    const duration = t === "error" || t === "warning" ? 7000 : 3200;
    timer.current = setTimeout(() => setVisible(false), duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* 日本語の長い文言は折り返す（横一列に伸ばすと画面からはみ出して横スクロールになる）。
          スマホでは下タブバーの上に出す（--bottom-nav-h は PC では 0）。
          class の "toast" と "hidden" は E2E（waitToastGone）が見ている目印なので残すこと。 */}
      <div
        role="status"
        aria-live="polite"
        className={`toast fixed inset-x-4 bottom-[calc(var(--bottom-nav-h)+1rem)] z-[9999] mx-auto w-fit max-w-[calc(100%-2rem)] rounded-2xl px-6 py-3 text-center text-[13px] leading-relaxed font-bold tracking-[0.02em] text-white shadow-xl md:bottom-7 md:max-w-md ${
          TOAST_BG[type]
        } ${visible ? "animate-toast-in" : "hidden"}`}
      >
        {msg}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
