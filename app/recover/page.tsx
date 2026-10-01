"use client";

import AuthShell, {
  AuthField,
  AuthForm,
  AuthNote,
  AuthSubmit,
  AuthSwitch,
  AuthTextLink,
} from "@/components/AuthShell";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { isAllowedEmail, ALLOWED_EMAIL_DOMAIN } from "@/lib/constants";

// 卒業などで大学メール（＝ログインID）が使えずロックアウトしたユーザーの救済。
// 大学メールを入力 → 登録時の復旧用アドレス宛に、ログインメール切替リンクを送る。
// リンク着地（/api/recover/confirm）は ?status= を付けてこのページに戻ってくる。
function RecoverInner() {
  const { showToast } = useToast();
  const params = useSearchParams();
  const status = params.get("status"); // done | invalid | error（confirm からの戻り）

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAllowedEmail(email)) {
      showToast(`大学メール（@${ALLOWED_EMAIL_DOMAIN}）を入力してください`, "error");
      return;
    }
    setSubmitting(true);
    try {
      await fetch("/api/recover/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch {
      /* 存在有無を漏らさないため、成否に関わらず同じ画面を出す */
    }
    setSubmitting(false);
    setSent(true);
  };

  // confirm から戻ってきたときの結果表示。
  if (status === "done") {
    return (
      <AuthShell
        title="ログインメールを復旧しました"
        description={
          <>
            ログイン用メールを復旧用アドレスに切り替えました。
            <br />
            そのアドレス宛にパスワード再設定メールを送りましたので、リンクから新しいパスワードを設定してログインしてください。
          </>
        }
      >
        <AuthNote>メールが届かない場合は迷惑メールフォルダをご確認ください。</AuthNote>
        <AuthSwitch bottom>
          <AuthTextLink href="/login">ログインへ</AuthTextLink>
        </AuthSwitch>
      </AuthShell>
    );
  }
  if (status === "invalid") {
    return (
      <AuthShell
        title="リンクが無効です"
        description="リンクの有効期限が切れているか、すでに使用済みです。お手数ですが、もう一度お試しください。"
      >
        <AuthSwitch bottom>
          <AuthTextLink href="/recover">復旧をやり直す</AuthTextLink>
        </AuthSwitch>
      </AuthShell>
    );
  }
  if (status === "error") {
    return (
      <AuthShell
        title="復旧に失敗しました"
        description="時間をおいて、もう一度お試しください。解決しない場合はサポートまでご連絡ください。"
      >
        <AuthSwitch bottom>
          <AuthTextLink href="/recover">復旧をやり直す</AuthTextLink>
        </AuthSwitch>
      </AuthShell>
    );
  }

  // request 送信後（存在有無に関わらず同じ結果を見せる）。
  if (sent) {
    return (
      <AuthShell
        title="復旧用メールを送信しました"
        description={
          <>
            入力された大学メールにアカウントが存在する場合、登録済みの復旧用アドレス宛にログイン切替リンクをお送りしました。
            <br />
            メール内のリンクを開くと復旧手続きに進みます。
          </>
        }
      >
        <AuthNote>
          メールが届かない場合は迷惑メールフォルダをご確認ください。復旧用アドレスは登録済みのアドレスにのみ送信されます。
        </AuthNote>
        <AuthSwitch bottom>
          <AuthTextLink href="/login">ログインに戻る</AuthTextLink>
        </AuthSwitch>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="大学メールが使えなくなった方へ"
      description={
        <>
          卒業などで大学メールでログインできなくなった場合は、登録時の
          <strong>復旧用アドレス</strong>宛にログイン切替リンクをお送りします。
          <br />
          ログインに使っていた大学メールアドレスを入力してください。
        </>
      }
    >
      <AuthForm onSubmit={handleSubmit}>
        <AuthField
          label="大学メールアドレス"
          required
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          placeholder={`example@${ALLOWED_EMAIL_DOMAIN}`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthSubmit icon="fa-paper-plane" disabled={submitting}>
          {submitting ? "送信中…" : "復旧用メールを送る"}
        </AuthSubmit>
      </AuthForm>

      <AuthSwitch bottom>
        <AuthTextLink href="/login">ログインに戻る</AuthTextLink>
      </AuthSwitch>
    </AuthShell>
  );
}

export default function RecoverPage() {
  return (
    // useSearchParams を使うので Suspense の境界が要る（静的生成時の制約）。
    <Suspense fallback={<main className="min-h-[calc(100svh-var(--bottom-nav-h))] bg-white md:min-h-screen md:bg-bg-gray" />}>
      <RecoverInner />
    </Suspense>
  );
}
