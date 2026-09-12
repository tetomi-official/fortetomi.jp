"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

// Stripe のオンボーディングから戻ってきた直後の画面。
// account.updated Webhook がまだ届いていない可能性があるので、ここで一度
// 状態を取り直す（GET /connect/status がその場で Stripe から取り直す）。
type ConnectStatus = {
  state: "未作成" | "手続き中" | "審査中" | "利用可能";
  requirementsDue?: string[];
};

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

export default function SellConnectReturnPage() {
  const { user, ready } = useAuth();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    fetchConnectStatus().then((result) => {
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStatus(result.status);
    });
  }, [ready, user]);

  const wrap = (children: React.ReactNode) => (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: "0 16px" }}>{children}</main>
  );

  if (ready && !user) return wrap(<p>ログインが必要です。</p>);
  if (error) return wrap(<p style={{ color: "#c0392b" }}>{error}</p>);
  if (!status) return wrap(<p>確認中…</p>);

  return wrap(
    <div className="form-card">
      {status.state === "利用可能" ? (
        <>
          <h2>登録が完了しました</h2>
          <p className="form-hint">受け渡し課金を受け取れるようになりました。</p>
        </>
      ) : status.state === "審査中" ? (
        <>
          <h2>審査中です</h2>
          <p className="form-hint">Stripeによる審査が完了するまでお待ちください。</p>
        </>
      ) : (
        <>
          <h2>登録が完了していません</h2>
          <p className="form-hint">
            入力が途中で終わっています
            {status.requirementsDue && status.requirementsDue.length > 0
              ? `（未入力の項目: ${status.requirementsDue.length}件）`
              : ""}
            。登録画面から続きを入力してください。
          </p>
        </>
      )}
      <Link
        href={status.state === "利用可能" ? "/sell" : "/sell/connect"}
        className="btn-navy btn-full"
        style={{ marginTop: 16 }}
      >
        {status.state === "利用可能" ? "出品にもどる" : "登録画面にもどる"}
      </Link>
    </div>,
  );
}
