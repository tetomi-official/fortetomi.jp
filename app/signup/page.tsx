"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import {
  ALLOWED_EMAIL_DOMAIN,
  FACULTIES,
  GENDERS,
  GRADES,
  UNIVERSITY_NAME,
  isAllowedEmail,
  isValidEmail,
} from "@/lib/constants";

// 確認メール再送のクールダウン（秒）。Supabase 側レート制限より短めに抑えて連打を防ぐ。
const RESEND_COOLDOWN_SEC = 60;

export default function SignupPage() {
  const { signUp, resendSignupEmail } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState({
    name: "",
    universityEmail: "",
    recoveryEmail: "",
    password: "",
    passwordConfirm: "",
    faculty: "",
    grade: "3年",
    gender: "",
  });
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // クールダウンのカウントダウン。
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleResend = async () => {
    if (!sentTo || resending || cooldown > 0) return;
    setResending(true);
    const { error } = await resendSignupEmail(sentTo);
    setResending(false);
    if (error) {
      showToast(error, "error");
      return;
    }
    showToast("確認メールを再送信しました", "success");
    setCooldown(RESEND_COOLDOWN_SEC);
  };

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !form.name ||
      !form.universityEmail ||
      !form.recoveryEmail ||
      !form.password ||
      !form.faculty ||
      !form.gender
    ) {
      showToast("必須項目を入力してください", "error");
      return;
    }
    if (!isAllowedEmail(form.universityEmail)) {
      showToast(`大学メールは @${ALLOWED_EMAIL_DOMAIN} のアドレスのみ登録できます`, "error");
      return;
    }
    if (!isValidEmail(form.recoveryEmail)) {
      showToast("復旧用メールアドレスの形式が正しくありません", "error");
      return;
    }
    if (form.password.length < 8) {
      showToast("パスワードは8文字以上にしてください", "error");
      return;
    }
    if (form.password !== form.passwordConfirm) {
      showToast("パスワードが一致しません", "error");
      return;
    }
    if (!agree) {
      showToast("利用規約への同意が必要です", "error");
      return;
    }

    setSubmitting(true);
    const { error, needsConfirm } = await signUp({
      name: form.name,
      universityEmail: form.universityEmail,
      recoveryEmail: form.recoveryEmail,
      password: form.password,
      university: UNIVERSITY_NAME,
      faculty: form.faculty,
      grade: form.grade,
      gender: form.gender,
    });
    setSubmitting(false);
    if (error) {
      showToast(error, "error");
      return;
    }
    if (needsConfirm) {
      // 実際に送信された宛先（正規化済み）を表示する。
      setSentTo(form.universityEmail.trim().toLowerCase());
      return;
    }
    showToast(`登録を受け付けました`, "success");
  };

  // 確認メール送信後（大学メール宛）の画面
  if (sentTo) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">TETOMI</div>
          <h1 className="auth-title">大学メールを確認してください</h1>
          <p className="auth-sub">
            在籍確認のため、<strong>{sentTo}</strong> 宛に確認メールを送りました。
            <br />
            メール内のリンクを開くと登録が完了し、この大学メールでログインできるようになります。
          </p>
          <p className="auth-note">
            メールが届かない場合は迷惑メールフォルダをご確認ください。届かない・リンクの有効期限が切れた場合は、下のボタンから再送信できます。
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
          <div className="auth-switch">
            すでに登録済みの方は <Link href="/login">ログイン</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">TETOMI</div>
        <h1 className="auth-title">新規登録</h1>
        <p className="auth-sub">
          {UNIVERSITY_NAME}の在学生向けサービスです。
          <br />
          大学メールでログインします。在籍確認のため大学メール宛に確認メールを送信します。
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
            <label>大学メールアドレス（ログイン用）</label>
            <input
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              placeholder={`example@${ALLOWED_EMAIL_DOMAIN}`}
              value={form.universityEmail}
              onChange={set("universityEmail")}
              required
            />
          </div>

          <div className="form-group required">
            <label>復旧用メールアドレス（個人の連絡先）</label>
            <input
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              placeholder="example@gmail.com"
              value={form.recoveryEmail}
              onChange={set("recoveryEmail")}
              required
            />
            <p className="field-hint" style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              卒業後も使えるアドレスを入力してください。大学メールが使えなくなった際の復旧・ログイン切替に使います。
            </p>
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
          <div className="form-group required">
            <label>パスワード（確認）</label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="もう一度入力"
              value={form.passwordConfirm}
              onChange={set("passwordConfirm")}
              required
            />
          </div>

          <div className="form-group">
            <label>大学名</label>
            <input type="text" value={UNIVERSITY_NAME} readOnly disabled />
          </div>

          <div className="form-row">
            <div className="form-group required">
              <label>学部</label>
              <select value={form.faculty} onChange={set("faculty")} required>
                <option value="" disabled>
                  選択してください
                </option>
                {FACULTIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group required">
              <label>学年</label>
              <select value={form.grade} onChange={set("grade")} required>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group required">
            <label>性別</label>
            <select value={form.gender} onChange={set("gender")} required>
              <option value="" disabled>
                選択してください
              </option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <label className="checkbox-row">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              <Link
                href="/terms"
                target="_blank"
                style={{ color: "var(--navy)", textDecoration: "underline" }}
              >
                利用規約
              </Link>
              ・
              <Link
                href="/privacy"
                target="_blank"
                style={{ color: "var(--navy)", textDecoration: "underline" }}
              >
                プライバシーポリシー
              </Link>
              に同意します
            </span>
          </label>

          <button type="submit" className="btn-navy btn-full" disabled={submitting}>
            <i className="fas fa-user-plus" /> {submitting ? "送信中…" : "登録する"}
          </button>
        </form>

        <p className="auth-note">
          大学メール（@{ALLOWED_EMAIL_DOMAIN}）がログインIDになります。卒業前に、マイページから復旧用の個人メールへ切り替えてください。
        </p>

        <div className="auth-switch">
          すでにアカウントをお持ちの方は <Link href="/login">ログイン</Link>
        </div>
      </div>
    </main>
  );
}
