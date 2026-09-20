"use client";

import Link from "next/link";
import AuthShell, {
  AuthCheckbox,
  AuthField,
  AuthFieldRow,
  AuthForm,
  AuthInlineLink,
  AuthNote,
  AuthSelect,
  AuthSubmit,
  AuthSwitch,
} from "@/components/AuthShell";
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
import { parseEntranceYear } from "@/lib/enrollment";

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
    if (parseEntranceYear(form.universityEmail) === null) {
      showToast("大学メールから入学年を判別できませんでした。アドレスをご確認ください", "error");
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
      // 確認画面はカードが短く、スクロール位置が保持されると先にフッターが
      // 見えてしまう（再送ボタンは上部）。即座に最上部へ戻す。
      window.scrollTo({ top: 0 });
      return;
    }
    showToast(`登録を受け付けました`, "success");
  };

  // 確認メール送信後（大学メール宛）の画面
  if (sentTo) {
    return (
      <AuthShell
        title="大学メールを確認してください"
        description={
          <>
            在籍確認のため、<strong>{sentTo}</strong> 宛に確認メールを送りました。
            <br />
            メール内のリンクを開くと登録が完了し、この大学メールでログインできるようになります。
          </>
        }
      >
        <AuthNote>
          メールが届かない場合は迷惑メールフォルダをご確認ください。届かない・リンクの有効期限が切れた場合は、下のボタンから再送信できます。
        </AuthNote>
        <AuthSubmit
          type="button"
          icon="fa-paper-plane"
          onClick={handleResend}
          disabled={resending || cooldown > 0}
        >
          {resending
            ? "送信中…"
            : cooldown > 0
              ? `再送信（${cooldown}秒後に再試行できます）`
              : "確認メールを再送信"}
        </AuthSubmit>
        <AuthSwitch bottom>
          <p className="flex flex-wrap items-center justify-center gap-1">
            すでに登録済みの方は
            <AuthInlineLink href="/login">ログイン</AuthInlineLink>
          </p>
        </AuthSwitch>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="新規登録"
      description={
        <>
          {UNIVERSITY_NAME}の在学生向けサービスです。
          <br />
          大学メールでログインします。在籍確認のため大学メール宛に確認メールを送信します。
        </>
      }
    >
      <AuthForm onSubmit={handleSubmit}>
        <AuthField
          label="お名前"
          required
          type="text"
          autoComplete="name"
          placeholder="山田 太郎"
          value={form.name}
          onChange={set("name")}
        />
        <AuthField
          label="大学メールアドレス（ログイン用）"
          required
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          placeholder={`example@${ALLOWED_EMAIL_DOMAIN}`}
          value={form.universityEmail}
          onChange={set("universityEmail")}
        />
        <AuthField
          label="復旧用メールアドレス（個人の連絡先）"
          required
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          placeholder="example@gmail.com"
          value={form.recoveryEmail}
          onChange={set("recoveryEmail")}
          hint="卒業後も使えるアドレスを入力してください。大学メールが使えなくなった際の復旧・ログイン切替に使います。"
        />
        <AuthField
          label="パスワード"
          required
          type="password"
          autoComplete="new-password"
          placeholder="8文字以上"
          value={form.password}
          onChange={set("password")}
        />
        <AuthField
          label="パスワード（確認）"
          required
          type="password"
          autoComplete="new-password"
          placeholder="もう一度入力"
          value={form.passwordConfirm}
          onChange={set("passwordConfirm")}
        />
        <AuthField label="大学名" type="text" value={UNIVERSITY_NAME} readOnly disabled />

        <AuthFieldRow>
          <AuthSelect label="学部" required value={form.faculty} onChange={set("faculty")}>
            <option value="" disabled>
              選択してください
            </option>
            {FACULTIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </AuthSelect>
          <AuthSelect label="学年" required value={form.grade} onChange={set("grade")}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </AuthSelect>
        </AuthFieldRow>

        <AuthSelect label="性別" required value={form.gender} onChange={set("gender")}>
          <option value="" disabled>
            選択してください
          </option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </AuthSelect>

        <AuthCheckbox checked={agree} onChange={(e) => setAgree(e.target.checked)}>
          <Link href="/terms" target="_blank" className="text-navy underline">
            利用規約
          </Link>
          ・
          <Link href="/privacy" target="_blank" className="text-navy underline">
            プライバシーポリシー
          </Link>
          に同意します
        </AuthCheckbox>

        <AuthSubmit icon="fa-user-plus" disabled={submitting}>
          {submitting ? "送信中…" : "登録する"}
        </AuthSubmit>
      </AuthForm>

      <AuthNote>
        大学メール（@{ALLOWED_EMAIL_DOMAIN}）がログインIDになります。卒業前に、マイページから復旧用の個人メールへ切り替えてください。
      </AuthNote>

      <AuthSwitch bottom>
        <p className="flex flex-wrap items-center justify-center gap-1">
          すでにアカウントをお持ちの方は
          <AuthInlineLink href="/login">ログイン</AuthInlineLink>
        </p>
      </AuthSwitch>
    </AuthShell>
  );
}
