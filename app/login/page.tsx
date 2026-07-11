"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";

// デモ用のシード済みアカウント（docs/supabase-seed.sql・全員 password123）。
// 学部をばらして、ログイン後の学部別一覧の違いを体験できるようにしている。
const DEMO_ACCOUNTS = [
  { email: "sato@g.chuo-u.ac.jp", name: "佐藤 花子", faculty: "経済学部", grade: "2年" },
  { email: "tanaka@g.chuo-u.ac.jp", name: "田中 太郎", faculty: "法学部", grade: "3年" },
  { email: "suzuki@g.chuo-u.ac.jp", name: "鈴木 健一", faculty: "理工学部", grade: "4年" },
  { email: "nakamura@g.chuo-u.ac.jp", name: "中村 結衣", faculty: "総合政策学部", grade: "2年" },
];

export default function LoginPage() {
  const router = useRouter();
  const { signIn, loginAsDemo } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showToast("メールアドレスとパスワードを入力してください", "error");
      return;
    }
    setSubmitting(true);
    const { error } = await signIn(email, password, remember);
    setSubmitting(false);
    if (error) {
      showToast("メールアドレスまたはパスワードが正しくありません", "error");
      return;
    }
    showToast("ログインしました", "success");
    router.push("/");
  };

  const demo = async (email: string) => {
    if (submitting) return;
    setSubmitting(true);
    const { error } = await loginAsDemo(email);
    setSubmitting(false);
    if (error) {
      showToast("デモログインに失敗しました", "error");
      return;
    }
    showToast("デモユーザーでログインしました", "success");
    router.push("/");
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
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>ログイン状態を保持する（30日間）</span>
          </label>
          <button
            type="submit"
            className="btn-navy btn-full"
            style={{ marginTop: 6 }}
            disabled={submitting}
          >
            <i className="fas fa-sign-in-alt" /> {submitting ? "ログイン中…" : "ログイン"}
          </button>
        </form>

        <div className="auth-switch" style={{ marginTop: 4 }}>
          <Link href="/forgot-password">パスワードをお忘れですか？</Link>
        </div>

        <p className="auth-note">
          パスワードの保存・自動入力はブラウザのパスワードマネージャに委譲しています（autocomplete=&quot;current-password&quot;）。ログイン状態の維持はセッション側の責務です。
        </p>

        <div className="modal-demo">
          <p className="modal-demo-title">— デモユーザーで試す —</p>
          <div className="demo-btns">
            {DEMO_ACCOUNTS.map((u) => (
              <button
                key={u.email}
                onClick={() => demo(u.email)}
                className="demo-btn"
                disabled={submitting}
              >
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
