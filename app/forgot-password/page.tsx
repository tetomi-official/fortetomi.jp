"use client";

import Link from "next/link";
import AuthShell, {
  AuthField,
  AuthForm,
  AuthNote,
  AuthSubmit,
  AuthSwitch,
  AuthTextLink,
} from "@/components/AuthShell";
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
      <AuthShell
        title="メールを確認してください"
        description={
          <>
            <strong>{sentTo}</strong> 宛にパスワード再設定用のリンクを送りました。
            <br />
            メール内のリンクを開いて、新しいパスワードを設定してください。
          </>
        }
      >
        <AuthNote>
          メールが届かない場合は迷惑メールフォルダをご確認ください。登録済みのアドレスにのみ送信されます。
        </AuthNote>
        <AuthSwitch bottom>
          <AuthTextLink href="/login">ログインに戻る</AuthTextLink>
        </AuthSwitch>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="パスワードをお忘れですか？"
      description={
        <>
          ログインに使っているメールアドレスを入力してください。
          <br />
          パスワード再設定用のリンクをお送りします。
        </>
      }
    >
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
          placeholder="example@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthSubmit icon="fa-paper-plane" disabled={submitting}>
          {submitting ? "送信中…" : "再設定メールを送る"}
        </AuthSubmit>
      </AuthForm>

      <AuthNote>
        卒業などで大学メールが使えずログインできない方は{" "}
        <Link href="/recover" className="font-bold text-navy underline">
          こちらから復旧
        </Link>
        してください。
      </AuthNote>

      <AuthSwitch bottom>
        <AuthTextLink href="/login">ログインに戻る</AuthTextLink>
      </AuthSwitch>
    </AuthShell>
  );
}
