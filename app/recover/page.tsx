"use client";

import Link from "next/link";
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
      <Card title="ログインメールを復旧しました">
        <p className="auth-sub">
          ログイン用メールを復旧用アドレスに切り替えました。
          <br />
          そのアドレス宛にパスワード再設定メールを送りましたので、リンクから新しいパスワードを設定してログインしてください。
        </p>
        <p className="auth-note">メールが届かない場合は迷惑メールフォルダをご確認ください。</p>
        <div className="auth-switch">
          <Link href="/login">ログインへ</Link>
        </div>
      </Card>
    );
  }
  if (status === "invalid") {
    return (
      <Card title="リンクが無効です">
        <p className="auth-sub">
          リンクの有効期限が切れているか、すでに使用済みです。お手数ですが、もう一度お試しください。
        </p>
        <div className="auth-switch">
          <Link href="/recover">復旧をやり直す</Link>
        </div>
      </Card>
    );
  }
  if (status === "error") {
    return (
      <Card title="復旧に失敗しました">
        <p className="auth-sub">
          時間をおいて、もう一度お試しください。解決しない場合はサポートまでご連絡ください。
        </p>
        <div className="auth-switch">
          <Link href="/recover">復旧をやり直す</Link>
        </div>
      </Card>
    );
  }

  // request 送信後（存在有無に関わらず同じ結果を見せる）。
  if (sent) {
    return (
      <Card title="復旧用メールを送信しました">
        <p className="auth-sub">
          入力された大学メールにアカウントが存在する場合、登録済みの復旧用アドレス宛にログイン切替リンクをお送りしました。
          <br />
          メール内のリンクを開くと復旧手続きに進みます。
        </p>
        <p className="auth-note">
          メールが届かない場合は迷惑メールフォルダをご確認ください。復旧用アドレスは登録済みのアドレスにのみ送信されます。
        </p>
        <div className="auth-switch">
          <Link href="/login">ログインに戻る</Link>
        </div>
      </Card>
    );
  }

  return (
    <Card title="大学メールが使えなくなった方へ">
      <p className="auth-sub">
        卒業などで大学メールでログインできなくなった場合は、登録時の
        <strong>復旧用アドレス</strong>宛にログイン切替リンクをお送りします。
        <br />
        ログインに使っていた大学メールアドレスを入力してください。
      </p>
      <form onSubmit={handleSubmit}>
        <div className="form-group required">
          <label>大学メールアドレス</label>
          <input
            type="email"
            autoComplete="email"
            placeholder={`example@${ALLOWED_EMAIL_DOMAIN}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn-navy btn-full" disabled={submitting}>
          <i className="fas fa-paper-plane" /> {submitting ? "送信中…" : "復旧用メールを送る"}
        </button>
      </form>
      <div className="auth-switch">
        <Link href="/login">ログインに戻る</Link>
      </div>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">TETOMI</div>
        <h1 className="auth-title">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export default function RecoverPage() {
  return (
    <Suspense fallback={<main className="auth-page" />}>
      <RecoverInner />
    </Suspense>
  );
}
