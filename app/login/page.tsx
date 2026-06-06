"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { mockUsers } from "@/lib/mock-data";

export default function LoginPage() {
  const router = useRouter();
  const { loginOrCreate, loginAsDemo } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showToast("メールアドレスとパスワードを入力してください", "error");
      return;
    }
    // モック: 既存ユーザーがいればログイン。なければ仮ユーザーで通す。
    const name = mockUsers.find((u) => u.email === email)?.name ?? email.split("@")[0];
    loginOrCreate({ name, email });
    showToast("ログインしました", "success");
    router.push("/listings");
  };

  const demo = (id: string) => {
    loginAsDemo(id);
    showToast("デモユーザーでログインしました", "success");
    router.push("/listings");
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">TETOMI</div>
        <h1 className="auth-title">ログイン</h1>
        <p className="auth-sub">大学メールアドレスでログインしてください</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group required">
            <label>メールアドレス</label>
            <input
              type="email"
              autoComplete="email"
              placeholder="example@glomac.ac.jp"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group required">
            <label>パスワード</label>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="パスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-navy btn-full" style={{ marginTop: 6 }}>
            <i className="fas fa-sign-in-alt" /> ログイン
          </button>
        </form>

        <p className="auth-note">
          パスワードの保存・自動入力はブラウザのパスワードマネージャに委譲しています（autocomplete=&quot;current-password&quot;）。ログイン状態の維持はセッション側の責務です。
        </p>

        <div className="modal-demo">
          <p className="modal-demo-title">— デモユーザーで試す —</p>
          <div className="demo-btns">
            {mockUsers.map((u) => (
              <button key={u.id} onClick={() => demo(u.id)} className="demo-btn">
                <i className="fas fa-user" style={{ marginRight: 6, opacity: 0.5 }} />
                {u.name}（{u.faculty} {u.grade}）
              </button>
            ))}
          </div>
        </div>

        <div className="auth-switch">
          アカウントをお持ちでない方は <Link href="/signup">新規登録</Link>
        </div>
      </div>
    </main>
  );
}
