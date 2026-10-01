"use client";

import Link from "next/link";
import AuthShell, {
  authActionClass,
  AuthField,
  AuthForm,
  AuthSubmit,
  AuthSwitch,
  AuthTextLink,
} from "@/components/AuthShell";
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
      <AuthShell
        title="リンクが無効です"
        description={
          <>
            パスワード再設定リンクの有効期限が切れているか、無効です。
            <br />
            お手数ですが、もう一度お試しください。
          </>
        }
      >
        <Link href="/forgot-password" className={`${authActionClass} md:mt-2`}>
          再設定メールを送り直す
        </Link>
        <AuthSwitch bottom>
          <AuthTextLink href="/login">ログインに戻る</AuthTextLink>
        </AuthSwitch>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        title="パスワードを変更しました"
        description="新しいパスワードでご利用いただけます。ホームへ移動します…"
      >
        {null}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="新しいパスワードを設定"
      description="新しいパスワードを入力してください（8文字以上）。"
    >
      <AuthForm onSubmit={handleSubmit}>
        <AuthField
          label="新しいパスワード"
          required
          type="password"
          autoComplete="new-password"
          placeholder="8文字以上"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <AuthField
          label="新しいパスワード（確認）"
          required
          type="password"
          autoComplete="new-password"
          placeholder="もう一度入力"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <AuthSubmit icon="fa-key" disabled={submitting || !ready}>
          {submitting ? "変更中…" : "パスワードを変更する"}
        </AuthSubmit>
      </AuthForm>
    </AuthShell>
  );
}
