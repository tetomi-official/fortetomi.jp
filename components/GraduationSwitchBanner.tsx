"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { isAllowedEmail } from "@/lib/constants";
import HeaderBanner from "@/components/HeaderBanner";

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
    <HeaderBanner
      tone="info"
      icon="fa-graduation-cap"
      message="卒業後もログインできるよう、個人のメールアドレスへの切り替えをおすすめします。"
      shortMessage="個人メールへの切り替えがおすすめ"
      href="/mypage?tab=profile"
      cta="メールを切り替える"
      shortCta="切り替え"
    />
  );
}
