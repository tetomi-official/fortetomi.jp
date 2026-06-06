"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";

const GRADES = ["1年", "2年", "3年", "4年", "院生"];

export default function SignupPage() {
  const router = useRouter();
  const { loginOrCreate } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    university: "GLOMAC大学",
    faculty: "",
    grade: "3年",
  });
  const [agree, setAgree] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      showToast("必須項目を入力してください", "error");
      return;
    }
    if (!agree) {
      showToast("利用規約への同意が必要です", "error");
      return;
    }
    // モック: 在籍確認メール送信は要件フェーズで Supabase Auth に委譲予定。
    loginOrCreate({
      name: form.name,
      email: form.email,
      university: form.university,
      faculty: form.faculty,
      grade: form.grade,
    });
    showToast(`登録完了！ようこそ ${form.name} さん`, "success");
    router.push("/listings");
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">TETOMI</div>
        <h1 className="auth-title">新規登録</h1>
        <p className="auth-sub">
          GLOMACの大学メールアドレスで登録してください。
          <br />
          在籍確認のため確認メールを送信します（予定）。
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group required">
            <label>お名前</label>
            <input
              type="text"
              autoComplete="name"
              placeholder="山田 太郎"
              value={form.name}
              onChange={set("name")}
              required
            />
          </div>
          <div className="form-group required">
            <label>大学メールアドレス</label>
            <input
              type="email"
              autoComplete="email"
              placeholder="example@glomac.ac.jp"
              value={form.email}
              onChange={set("email")}
              required
            />
          </div>
          <div className="form-group required">
            <label>パスワード</label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="8文字以上"
              value={form.password}
              onChange={set("password")}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>学部</label>
              <input type="text" placeholder="工学部" value={form.faculty} onChange={set("faculty")} />
            </div>
            <div className="form-group">
              <label>学年</label>
              <select value={form.grade} onChange={set("grade")}>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="checkbox-row">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              <a href="#" style={{ color: "var(--navy)", textDecoration: "underline" }}>
                利用規約
              </a>
              ・
              <a href="#" style={{ color: "var(--navy)", textDecoration: "underline" }}>
                プライバシーポリシー
              </a>
              に同意します
            </span>
          </label>

          <button type="submit" className="btn-navy btn-full">
            <i className="fas fa-user-plus" /> 登録する
          </button>
        </form>

        <p className="auth-note">
          在籍担保を最優先とし、許可された大学ドメイン（@xxx.ac.jp）のみ受け付ける設計方針です。新規登録パスワード欄は autocomplete=&quot;new-password&quot; を付与しています。
        </p>

        <div className="auth-switch">
          すでにアカウントをお持ちの方は <Link href="/login">ログイン</Link>
        </div>
      </div>
    </main>
  );
}
