"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { safeNextPath } from "@/lib/redirect";
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
// プレリリース中は PAY.jp 審査担当者が閲覧確認できるよう 1 アカウントに限定する。
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
        <AuthCheckbox checked={remember} onChange={(e) => setRemember(e.target.checked)}>
          ログイン状態を保持する（30日間）
        </AuthCheckbox>
        <AuthSubmit icon="fa-sign-in-alt" disabled={submitting}>
          {submitting ? "ログイン中…" : "ログイン"}
        </AuthSubmit>
      </AuthForm>

      <AuthSwitch>
        <AuthTextLink href="/forgot-password">パスワードをお忘れですか？</AuthTextLink>
      </AuthSwitch>

      {/* デモユーザー。md 未満は中央寄せの文字リンク、md 以上はこれまでのボタンのまま。
          class の "demo-btn" は scripts/capture-flow.mjs が見ている目印なので残すこと。 */}
      <div className="flex flex-col md:mt-5 md:gap-2 md:border-t md:border-line-light md:pt-5">
        <p className="hidden md:mb-3 md:block md:text-center md:text-[11px] md:tracking-[0.06em] md:text-ink-muted md:uppercase">
          — デモユーザーで試す —
        </p>
        {DEMO_ACCOUNTS.map((u) => (
          <button
            key={u.email}
            type="button"
            onClick={() => demo(u.email)}
            disabled={submitting}
            className="demo-btn font-en flex min-h-11 items-center justify-center text-sm text-ink-mid transition-all md:min-h-0 md:rounded-sm md:border md:border-line-light md:bg-bg-light md:px-4 md:py-[11px] md:text-[13px] md:font-semibold md:text-navy md:hover:bg-navy md:hover:text-white"
          >
            {/* アイコンは md 以上だけ。Font Awesome はレイヤー外の CSS で display を
                指定していて hidden が効かないので、span で包んで包み側を消す。 */}
            <span className="mr-1.5 hidden opacity-50 md:inline-block" aria-hidden="true">
              <i className="fas fa-user" />
            </span>
            <span className="md:hidden">デモユーザー（{u.name}）で試す</span>
            <span className="hidden md:inline">
              {u.name}（{u.faculty} {u.grade}）
            </span>
          </button>
        ))}
      </div>

      <AuthSwitch bottom>
        <p className="flex flex-wrap items-center justify-center gap-1">
          アカウントをお持ちでない方は
          <AuthInlineLink href="/signup">新規登録</AuthInlineLink>
        </p>
      </AuthSwitch>
    </AuthShell>
  );
}
