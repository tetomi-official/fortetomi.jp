"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import HeaderBanner from "@/components/HeaderBanner";

// ログイン中だが在籍が失効しているユーザーに、再認証を促す常時バナー。
// 出品・購入が停止していることを知らせ、/reverify へ誘導する。
export default function ReverifyBanner() {
  const { user, ready, enrollmentActive } = useAuth();
  const pathname = usePathname();

  // 未ログイン / 在籍有効 / 初期化前 / 再認証ページ自身では出さない。
  if (!ready || !user || enrollmentActive || pathname === "/reverify") return null;

  return (
    <HeaderBanner
      tone="alert"
      icon="fa-exclamation-triangle"
      message="新年度の在籍確認が必要です。再認証するまで出品・購入はできません。"
      shortMessage="新年度の在籍確認が必要です"
      href="/reverify"
      cta="大学メールで再認証する"
      shortCta="再認証"
    />
  );
}
