"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { isAllowedEmail } from "@/lib/constants";

// 卒業が近い（4年 / 院生）かつログインIDがまだ大学メールのユーザーに、
// 個人メールへの切替を促す常時バナー。切替を忘れたまま大学メールが失効すると
// ログイン・パスワード再設定ができなくなる（ロックアウト）ため、事前に促す。
export default function GraduationSwitchBanner() {
  const { user, ready } = useAuth();
  const pathname = usePathname();

  // 未ログイン / 初期化前 / マイページ（切替UIがある本人ページ）では出さない。
  if (!ready || !user || pathname === "/mypage") return null;
  // ログインIDがすでに個人メール（大学ドメインでない）＝切替済みなら不要。
  if (!isAllowedEmail(user.email)) return null;
  // 卒業が近い学年のみ対象。
  if (user.grade !== "4年" && user.grade !== "院生") return null;

  return (
    <div
      role="alert"
      style={{
        background: "#eff6ff",
        borderBottom: "1px solid #93c5fd",
        color: "#1e3a8a",
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
        <i className="fas fa-graduation-cap" style={{ marginRight: 6 }} />
        卒業後もログインできるよう、個人のメールアドレスへの切り替えをおすすめします。
      </span>
      <Link
        href="/mypage?tab=profile"
        style={{
          background: "#1e3a8a",
          color: "#fff",
          padding: "5px 14px",
          borderRadius: 999,
          fontWeight: 700,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        メールを切り替える
      </Link>
    </div>
  );
}
