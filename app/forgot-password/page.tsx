"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { isValidEmail } from "@/lib/constants";

// パスワード再設定メールの送信（PB-012）。
// 個人メール（ログインID）宛に再設定リンクを送る。
export default function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      showToast("メールアドレスの形式が正しくありません", "error");
      return;
    }
    setSubmitting(true);
    const { error } = await sendPasswordReset(email.trim());
    setSubmitting(false);
    if (error) {
      showToast(error, "error");
      return;
    }
    // 登録の有無を問わず同じ結果を見せる（アカウント存在の推測を防ぐ）。
    setSentTo(email.trim());
  };

  if (sentTo) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">TETOMI</div>
          <h1 className="auth-title">メールを確認してください</h1>
          <p className="auth-sub">
            <strong>{sentTo}</strong> 宛にパスワード再設定用のリンクを送りました。
            <br />
            メール内のリンクを開いて、新しいパスワードを設定してください。
          </p>
          <p className="auth-note">
            メールが届かない場合は迷惑メールフォルダをご確認ください。登録済みのアドレスにのみ送信されます。
          </p>
          <div className="auth-switch">
            <Link href="/login">ログインに戻る</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">TETOMI</div>
        <h1 className="auth-title">パスワードをお忘れですか？</h1>
        <p className="auth-sub">
          登録した個人メールアドレスを入力してください。
          <br />
          パスワード再設定用のリンクをお送りします。
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group required">
            <label>メールアドレス</label>
            <input
              type="email"
              autoComplete="email"
              placeholder="example@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-navy btn-full" disabled={submitting}>
            <i className="fas fa-paper-plane" /> {submitting ? "送信中…" : "再設定メールを送る"}
          </button>
        </form>

        <div className="auth-switch">
          <Link href="/login">ログインに戻る</Link>
        </div>
      </div>
    </main>
  );
}
