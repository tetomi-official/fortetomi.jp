"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";

// 新しいパスワードの設定（PB-012）。
// メールの再設定リンク → /auth/confirm(type=recovery) が回復セッションを張った状態でここに来る。
export default function ResetPasswordPage() {
  const router = useRouter();
  const { user, ready, updatePassword } = useAuth();
  const { showToast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      showToast("パスワードは8文字以上にしてください", "error");
      return;
    }
    if (password !== confirm) {
      showToast("パスワードが一致しません", "error");
      return;
    }
    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);
    if (error) {
      showToast(error, "error");
      return;
    }
    setDone(true);
    showToast("パスワードを変更しました", "success");
    setTimeout(() => router.push("/"), 1200);
  };

  // 回復セッションが無い（リンク未経由・期限切れ）場合の案内。
  if (ready && !user && !done) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">TETOMI</div>
          <h1 className="auth-title">リンクが無効です</h1>
          <p className="auth-sub">
            パスワード再設定リンクの有効期限が切れているか、無効です。
            <br />
            お手数ですが、もう一度お試しください。
          </p>
          <Link href="/forgot-password" className="btn-navy btn-full" style={{ marginTop: 8 }}>
            再設定メールを送り直す
          </Link>
          <div className="auth-switch">
            <Link href="/login">ログインに戻る</Link>
          </div>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">TETOMI</div>
          <h1 className="auth-title">パスワードを変更しました</h1>
          <p className="auth-sub">新しいパスワードでご利用いただけます。ホームへ移動します…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">TETOMI</div>
        <h1 className="auth-title">新しいパスワードを設定</h1>
        <p className="auth-sub">新しいパスワードを入力してください（8文字以上）。</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group required">
            <label>新しいパスワード</label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="8文字以上"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="form-group required">
            <label>新しいパスワード（確認）</label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="もう一度入力"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-navy btn-full" disabled={submitting || !ready}>
            <i className="fas fa-key" /> {submitting ? "変更中…" : "パスワードを変更する"}
          </button>
        </form>
      </div>
    </main>
  );
}
