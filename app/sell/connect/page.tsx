"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

// 出品者の受取口座（Stripe Connect）登録ハブ。
//  - 未作成: 「口座登録をはじめる」→ Stripe がホストする本人確認・口座入力へ全画面遷移
//  - 手続き中・要対応: 「登録を続ける」→ 新しいオンボーディングリンクを発行して再遷移
//  - 審査中: Stripe側の審査待ち。手動で状態を確認できるようにする
//  - 利用可能: 完了。受け渡し課金を受けられる状態
type ConnectStatus = {
  state: "未作成" | "手続き中" | "審査中" | "利用可能" | "要対応";
  requirementsDue?: string[];
  disabledReason?: string | null;
};

function stateMessage(state: ConnectStatus["state"]): string {
  switch (state) {
    case "未作成":
      return "受け渡し課金を受け取るには、Stripeでの口座登録が必要です。";
    case "手続き中":
      return "口座登録が完了していません。続きから再開できます。";
    case "要対応":
      return "追加の確認が必要です。続きから対応してください。";
    case "審査中":
      return "Stripeによる審査中です。しばらくお待ちください。";
    case "利用可能":
      return "口座登録が完了しています。受け渡し課金を受け取れます。";
  }
}

type StatusResult = { ok: true; status: ConnectStatus } | { ok: false; error: string };

// コンポーネントの外に置く。effect の中から直接 setState する関数を呼ぶと
// ESLint（react-hooks/set-state-in-effect）に「effect内で直接 setState している」
// とみなされるため、フェッチ処理は純粋な関数として外に出し、.then() の中で setState する。
async function fetchConnectStatus(): Promise<StatusResult> {
  try {
    const res = await fetch("/api/payments/connect/status");
    const data = (await res.json().catch(() => null)) as
      | ConnectStatus
      | { error: string }
      | null;
    if (!res.ok || !data || !("state" in data)) {
      return { ok: false, error: (data as { error?: string } | null)?.error ?? "状態の取得に失敗しました" };
    }
    return { ok: true, status: data };
  } catch {
    return { ok: false, error: "通信エラーが発生しました" };
  }
}

export default function SellConnectPage() {
  const { user, ready } = useAuth();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ボタンの「状態を確認する」から呼ぶ用（イベントハンドラなので直接 setState してよい）。
  async function refreshStatus() {
    const result = await fetchConnectStatus();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStatus(result.status);
    setError(null);
  }

  useEffect(() => {
    if (!ready || !user) return;
    fetchConnectStatus().then((result) => {
      if (!result.ok) {
        setError(result.error);
      } else {
        setStatus(result.status);
      }
      setLoading(false);
    });
  }, [ready, user]);

  async function startOnboarding() {
    setSubmitting(true);
    setError(null);
    try {
      const endpoint =
        status?.state === "未作成" ? "/api/payments/connect/account" : "/api/payments/connect/link";
      const res = await fetch(endpoint, { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { onboardingUrl?: string; error?: string }
        | null;
      if (!res.ok || !data?.onboardingUrl) {
        setError(data?.error ?? "口座登録の準備に失敗しました");
        setSubmitting(false);
        return;
      }
      // Stripe のオンボーディングは iframe 埋め込みを拒否するため、全画面遷移する。
      window.location.href = data.onboardingUrl;
    } catch {
      setError("通信エラーが発生しました");
      setSubmitting(false);
    }
  }

  const wrap = (children: React.ReactNode) => (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: "0 16px" }}>{children}</main>
  );

  if (ready && !user) return wrap(<p>ログインが必要です。</p>);
  if (loading) return wrap(<p>読み込み中…</p>);

  return wrap(
    <div className="form-card">
      <h2>受取口座の登録</h2>
      {status && <p className="form-hint">{stateMessage(status.state)}</p>}
      {status?.state === "要対応" && status.requirementsDue && status.requirementsDue.length > 0 && (
        <p className="form-hint">不足項目: {status.requirementsDue.join(", ")}</p>
      )}
      {error && <p style={{ color: "#c0392b", fontSize: 14, margin: "12px 0" }}>{error}</p>}

      {status?.state === "利用可能" ? (
        <Link href="/sell" className="btn-navy btn-full" style={{ marginTop: 16 }}>
          出品にもどる
        </Link>
      ) : status?.state === "審査中" ? (
        <button className="btn-outline btn-full" style={{ marginTop: 16 }} onClick={() => void refreshStatus()}>
          状態を確認する
        </button>
      ) : (
        <button
          className="btn-navy btn-full"
          style={{ marginTop: 16 }}
          onClick={startOnboarding}
          disabled={submitting}
        >
          {submitting ? "準備中…" : status?.state === "未作成" ? "口座登録をはじめる" : "登録を続ける"}
        </button>
      )}
    </div>,
  );
}
