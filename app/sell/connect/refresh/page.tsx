"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

// AccountLink は1回きりで数分で失効する。Stripe はリンクが切れて中断された場合、
// ここ（refresh_url）に戻す。ユーザーの操作を待たず、新しいリンクを発行して
// 即座に再遷移する。
type LinkResult = { ok: true; url: string } | { ok: false; error: string };

async function fetchFreshLink(): Promise<LinkResult> {
  try {
    const res = await fetch("/api/payments/connect/link", { method: "POST" });
    const data = (await res.json().catch(() => null)) as
      | { onboardingUrl?: string; error?: string }
      | null;
    if (!res.ok || !data?.onboardingUrl) {
      return { ok: false, error: data?.error ?? "リンクの発行に失敗しました" };
    }
    return { ok: true, url: data.onboardingUrl };
  } catch {
    return { ok: false, error: "通信エラーが発生しました" };
  }
}

export default function SellConnectRefreshPage() {
  const { user, ready } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    fetchFreshLink().then((result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.href = result.url;
    });
  }, [ready, user]);

  const wrap = (children: React.ReactNode) => (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: "0 16px" }}>{children}</main>
  );

  if (ready && !user) return wrap(<p>ログインが必要です。</p>);
  if (error) {
    return wrap(
      <div className="form-card">
        <h2>再開できませんでした</h2>
        <p className="form-hint">{error}</p>
        <a href="/sell/connect" className="btn-navy btn-full" style={{ marginTop: 16 }}>
          登録画面にもどる
        </a>
      </div>,
    );
  }
  return wrap(<p>リンクを再発行しています…</p>);
}
