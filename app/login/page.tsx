"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { safeNextPath } from "@/lib/redirect";
import Link from "next/link";
import AuthShell, {
  AuthCheckbox,
  AuthField,
  AuthForm,
  AuthInlineLink,
  AuthSubmit,
  AuthSwitch,
  AuthTextLink,
} from "@/components/AuthShell";

// デモ用のシード済みアカウント（supabase/seed.sql・password123）。
// プレリリース中は決済会社の審査担当者が閲覧確認できるよう 1 アカウントに限定する。
const DEMO_ACCOUNTS = [
  { email: "sato@g.chuo-u.ac.jp", name: "佐藤 花子", faculty: "経済学部", grade: "2年" },
];

export default function LoginPage() {
  const router = useRouter();
  const { signIn, loginAsDemo } = useAuth();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ログインしたら、来たページ（?next=）に戻る。無い・怪しいときはトップ。
  // useSearchParams だとページ全体を Suspense で包む必要があるので、押した時点で URL から読む。
  const goNext = () => router.push(safeNextPath(new URLSearchParams(window.location.search).get("next")));

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
    goNext();
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
    goNext();
  };

  return (
    <AuthShell title="ログイン" description="大学メールアドレスでログインしてください">
      <AuthForm onSubmit={handleSubmit}>
        <AuthField
          label="メールアドレス"
          required
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          placeholder="example@g.chuo-u.ac.jp"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthField
          label="パスワード"
          required
          type="password"
          autoComplete="current-password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {/* 案3：「30日間保持」と「パスワードをお忘れですか？」を1行に左右で並べる。
            md 以上はこれまでどおり、チェックは単独・リンクは下の区切り線の中に置く。 */}
        <div className="flex items-center justify-between gap-2 md:block">
          <AuthCheckbox compact checked={remember} onChange={(e) => setRemember(e.target.checked)}>
            <span className="md:hidden">30日間保持</span>
            <span className="hidden md:inline">ログイン状態を保持する（30日間）</span>
          </AuthCheckbox>
          <Link
            href="/forgot-password"
            className="flex min-h-11 shrink-0 items-center text-[13px] text-navy md:hidden"
          >
            パスワードをお忘れですか？
          </Link>
        </div>
        <AuthSubmit icon="fa-sign-in-alt" disabled={submitting}>
          {submitting ? "ログイン中…" : "ログイン"}
        </AuthSubmit>
      </AuthForm>

      {/* md 以上だけ：これまでの区切り線つきの並び */}
      <div className="hidden md:block">
        <AuthSwitch>
          <AuthTextLink href="/forgot-password">パスワードをお忘れですか？</AuthTextLink>
        </AuthSwitch>
      </div>

      {/* デモユーザー。md 以上はこれまでのボタンのまま。
          class の "demo-btn" は scripts/capture-flow.mjs が見ている目印なので残すこと。 */}
      <div className="hidden md:mt-5 md:flex md:flex-col md:gap-2 md:border-t md:border-line-light md:pt-5">
        <p className="md:mb-3 md:text-center md:text-[11px] md:tracking-[0.06em] md:text-ink-muted md:uppercase">
          — デモユーザーで試す —
        </p>
        {DEMO_ACCOUNTS.map((u) => (
          <button
            key={u.email}
            type="button"
            onClick={() => demo(u.email)}
            disabled={submitting}
            className="demo-btn font-en rounded-sm border border-line-light bg-bg-light px-4 py-[11px] text-[13px] font-semibold text-navy transition-all hover:bg-navy hover:text-white"
          >
            <i className="fas fa-user mr-1.5 opacity-50" aria-hidden="true" />
            {u.name}（{u.faculty} {u.grade}）
          </button>
        ))}
      </div>

      {/* 案3：画面の下端に「はじめての方は 新規登録・デモで試す」を1行で置く（md 未満）。 */}
      <AuthSwitch bottom>
        <p className="flex flex-wrap items-center justify-center gap-1 md:hidden">
          はじめての方は
          <AuthInlineLink href="/signup">新規登録</AuthInlineLink>
          <span>・</span>
          <button
            type="button"
            onClick={() => demo(DEMO_ACCOUNTS[0].email)}
            disabled={submitting}
            className="demo-btn inline-flex min-h-11 items-center text-sm text-ink-mid"
          >
            デモで試す
          </button>
        </p>
        <p className="hidden md:flex md:flex-wrap md:items-center md:justify-center md:gap-1">
          アカウントをお持ちでない方は
          <AuthInlineLink href="/signup">新規登録</AuthInlineLink>
        </p>
      </AuthSwitch>
    </AuthShell>
  );
}
