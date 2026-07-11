"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";

type Status = "loading" | "sent" | "await" | "error";

// 確認メール再送のクールダウン（秒）。
const RESEND_COOLDOWN_SEC = 60;

export default function SignupCompletePage() {
  const { promotePersonalEmail } = useAuth();
  // ?await=1 … 片側だけ確認済みで切替待ち。再送信はせず案内だけ出す。
  const [status, setStatus] = useState<Status>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("await") === "1"
      ? "await"
      : "loading",
  );
  const [email, setEmail] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resendNote, setResendNote] = useState("");
  const started = useRef(false);

  // クールダウンのカウントダウン。
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // 個人メール宛の確認メールを再送する。promotePersonalEmail の再呼び出しで
  // updateUser が再度確認メールを送る（新規の送信経路は作らない）。
  const handleResend = async () => {
    if (resending || cooldown > 0) return;
    setResending(true);
    setResendNote("");
    const { error } = await promotePersonalEmail();
    setResending(false);
    if (error) {
      setResendNote(error);
      return;
    }
    setResendNote("確認メールを再送信しました");
    setCooldown(RESEND_COOLDOWN_SEC);
  };

  useEffect(() => {
    if (started.current) return; // StrictMode の二重実行ガード
    started.current = true;
    // 切替待ち（?await=1）は再送信しない
    if (new URLSearchParams(window.location.search).get("await") === "1") return;

    (async () => {
      const { error, email } = await promotePersonalEmail();
      setEmail(email);
      if (error) {
        setStatus("error");
        setMessage(error);
        return;
      }
      setStatus("sent");
    })();
  }, [promotePersonalEmail]);

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">TETOMI</div>

        {status === "loading" && (
          <>
            <h1 className="auth-title">在籍確認が完了しました</h1>
            <p className="auth-sub">個人メールの登録手続きを進めています…</p>
          </>
        )}

        {status === "sent" && (
          <>
            <h1 className="auth-title">個人メールを確認してください</h1>
            <p className="auth-sub">
              {email ? <strong>{email}</strong> : "登録した個人メール"} 宛に確認メールを送りました。
              <br />
              メール内のリンクを開くと登録が完了し、このメールアドレスでログインできるようになります。
            </p>
            <p className="auth-note">
              メールが届かない場合は迷惑メールフォルダをご確認ください。届かない場合は下のボタンから再送信できます。
            </p>
            <button
              type="button"
              className="btn-navy btn-full"
              onClick={handleResend}
              disabled={resending || cooldown > 0}
            >
              <i className="fas fa-paper-plane" />{" "}
              {resending
                ? "送信中…"
                : cooldown > 0
                  ? `再送信（${cooldown}秒後に再試行できます）`
                  : "確認メールを再送信"}
            </button>
            {resendNote && <p className="auth-note">{resendNote}</p>}
          </>
        )}

        {status === "await" && (
          <>
            <h1 className="auth-title">もう1通の確認が必要です</h1>
            <p className="auth-sub">
              安全のため、<strong>大学メール</strong>と<strong>個人メール</strong>の両方に確認メールを送っています。
              <br />
              まだ開いていない方のリンクも開くと、切り替えが完了します。
            </p>
            <p className="auth-note">
              両方開いても切り替わらない場合は、お手数ですが登録をやり直してください。
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="auth-title">手続きに失敗しました</h1>
            <p className="auth-sub">{message}</p>
            <div className="auth-switch">
              お手数ですが <Link href="/signup">登録</Link> をやり直してください。
            </div>
          </>
        )}
      </div>
    </main>
  );
}
