"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

// ログイン中だが在籍が失効しているユーザーに、再認証を促す常時バナー。
// 出品・購入が停止していることを知らせ、/reverify へ誘導する。
export default function ReverifyBanner() {
  const { user, ready, enrollmentActive } = useAuth();
  const pathname = usePathname();

  // 未ログイン / 在籍有効 / 初期化前 / 再認証ページ自身では出さない。
  if (!ready || !user || enrollmentActive || pathname === "/reverify") return null;

  return (
    <div
      role="alert"
      style={{
        background: "#fff7ed",
        borderBottom: "1px solid #fdba74",
        color: "#9a3412",
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
        <i className="fas fa-exclamation-triangle" style={{ marginRight: 6 }} />
        新年度の在籍確認が必要です。再認証するまで出品・購入はできません。
      </span>
      <Link
        href="/reverify"
        style={{
          background: "#9a3412",
          color: "#fff",
          padding: "5px 14px",
          borderRadius: 999,
          fontWeight: 700,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        大学メールで再認証する
      </Link>
    </div>
  );
}
