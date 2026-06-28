"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { formatEnrollmentDeadline } from "@/lib/enrollment";

export default function ReverifyPage() {
  const { user, ready, enrollmentActive, refreshUser } = useAuth();
  const { showToast } = useToast();
  const params = useSearchParams();
  const status = params.get("status"); // done | invalid | error（メールリンクからの戻り）

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // メールリンクから戻ってきた直後は profiles を再取得して状態を反映。
  useEffect(() => {
    if (status === "done") {
      void refreshUser();
      showToast("在籍の再認証が完了しました！", "success");
    } else if (status === "invalid") {
      showToast("リンクが無効または期限切れです。もう一度お試しください。", "error");
    } else if (status === "error") {
      showToast("処理に失敗しました。時間をおいてお試しください。", "error");
    }
    // status は初回マウント時のみ参照すれば十分
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMail = async () => {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/reverify/request", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body.error || "送信に失敗しました", "error");
        return;
      }
      setSent(true);
      showToast("再認証メールを送信しました", "success");
    } catch {
      showToast("送信に失敗しました。時間をおいてお試しください。", "error");
    } finally {
      setSending(false);
    }
  };

  if (!ready) {
    return <main className="page-main" style={{ background: "var(--bg-gray)" }} />;
  }

  if (!user) {
    return (
      <main className="page-main" style={{ background: "var(--bg-gray)" }}>
        <div className="sell-container">
          <div className="form-card" style={{ textAlign: "center", padding: "48px 32px" }}>
            <div style={{ fontSize: "3rem", marginBottom: 16 }}>🔐</div>
            <h3 style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--navy)", marginBottom: 12 }}>
              ログインが必要です
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
              在籍の再認証にはログインが必要です。
            </p>
            <Link href="/login" className="btn-navy">
              <i className="fas fa-sign-in-alt" /> ログイン
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-main" style={{ background: "var(--bg-gray)" }}>
      <div className="sell-container">
        <div className="form-card" style={{ padding: "40px 32px" }}>
          {enrollmentActive ? (
            // 在籍が有効
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2.6rem", marginBottom: 12, color: "var(--navy)" }}>
                <i className="fas fa-check-circle" />
              </div>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 900, color: "var(--navy)", marginBottom: 10, border: "none", padding: 0 }}>
                在籍は確認済みです
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>
                出品・購入をご利用いただけます。<br />
                次回の再認証期限：<strong>{formatEnrollmentDeadline(user.enrollment_valid_until)}</strong>
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <Link href="/listings" className="btn-navy">
                  <i className="fas fa-list" /> 一覧を見る
                </Link>
                <Link href="/sell" className="btn-outline">
                  <i className="fas fa-plus" /> 出品する
                </Link>
              </div>
            </div>
          ) : (
            // 失効中 → 再認証を促す
            <div>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ fontSize: "2.6rem", marginBottom: 12 }}>📧</div>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 900, color: "var(--navy)", marginBottom: 10, border: "none", padding: 0 }}>
                  大学メールの再認証が必要です
                </h2>
                <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.9 }}>
                  新年度の在籍確認のため、大学メールアドレスでの再認証をお願いします。
                  <br />
                  再認証が完了するまで、出品・購入はご利用いただけません（閲覧は可能です）。
                </p>
              </div>

              <div style={{ padding: 16, background: "var(--bg-light)", borderRadius: "var(--r)", marginBottom: 24, fontSize: 14, lineHeight: 1.8 }}>
                <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 4 }}>
                  送信先（大学メール）
                </div>
                <strong style={{ color: "var(--navy)" }}>
                  {user.university_email || "（未登録）"}
                </strong>
              </div>

              {sent ? (
                <div style={{ textAlign: "center" }}>
                  <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.9, marginBottom: 16 }}>
                    再認証メールを送信しました。メール内のリンクから再認証を完了してください。
                    <br />
                    （届かない場合は迷惑メールフォルダもご確認ください）
                  </p>
                  <button onClick={sendMail} disabled={sending} className="btn-outline">
                    <i className="fas fa-redo" /> もう一度送信する
                  </button>
                </div>
              ) : (
                <button
                  onClick={sendMail}
                  disabled={sending || !user.university_email}
                  className="btn-navy btn-full"
                  style={{ padding: 16, fontSize: 16 }}
                >
                  {sending ? (
                    <>
                      <i className="fas fa-spinner fa-spin" /> 送信中…
                    </>
                  ) : (
                    <>
                      <i className="fas fa-paper-plane" /> 大学メールで再認証する
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
