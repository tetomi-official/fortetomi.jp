"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { canReserve } from "@/lib/prerelease";

// 復旧用（個人）メールが「未設定」または「未検証」のユーザーに、確認を促す常時バナー。
// 検証済みの復旧用アドレスがないと、卒業などで大学メールが失効したときに
// ロックアウト救済（recover）が使えず、アカウントに戻れなくなるため事前に促す。
export default function RecoveryEmailVerifyBanner() {
  const { user, ready } = useAuth();
  const pathname = usePathname();

  // プレリリース phase 0 では確認UI（マイページのプロフィール欄）が「準備中」で
  // 到達できないため、催促バナーも出さない（リンク切れ防止）。canReserve（phase 1）で
  // 確認UIと同時に有効化する。
  if (!canReserve) return null;
  // 未ログイン / 初期化前 / マイページ（設定UIがある本人ページ）では出さない。
  if (!ready || !user || pathname === "/mypage") return null;
  // すでに検証済みなら不要。
  if (user.recovery_email_verified) return null;

  const notSet = !user.recovery_email;
  const message = notSet
    ? "卒業後もアカウントを復旧できるよう、復旧用の個人メールアドレスを登録してください。"
    : "登録した復旧用メールアドレスがまだ未確認です。確認しておくと、卒業後の復旧に使えます。";
  const cta = notSet ? "メールを登録する" : "メールを確認する";

  return (
    <div
      role="alert"
      style={{
        background: "#fefce8",
        borderBottom: "1px solid #fde047",
        color: "#854d0e",
        padding: "10px 16px",
        fontSize: 13,
        lineHeight: 1.6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        flexWrap: "wrap",
        textAlign: "center",
      }}
    >
      <span>
        <i className="fas fa-envelope-circle-check" style={{ marginRight: 6 }} />
        {message}
      </span>
      <Link
        href="/mypage?tab=profile"
        style={{
          background: "#854d0e",
          color: "#fff",
          padding: "5px 14px",
          borderRadius: 999,
          fontWeight: 700,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        {cta}
      </Link>
    </div>
  );
}
