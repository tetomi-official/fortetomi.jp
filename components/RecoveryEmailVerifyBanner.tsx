"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { canReserve } from "@/lib/prerelease";
import HeaderBanner from "@/components/HeaderBanner";

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

  return (
    <HeaderBanner
      tone="warn"
      icon="fa-envelope-circle-check"
      message={
        notSet
          ? "卒業後もアカウントを復旧できるよう、復旧用の個人メールアドレスを登録してください。"
          : "登録した復旧用メールアドレスがまだ未確認です。確認しておくと、卒業後の復旧に使えます。"
      }
      shortMessage={notSet ? "復旧用メールを登録してください" : "復旧用メールが未確認です"}
      href="/mypage?tab=profile"
      cta={notSet ? "メールを登録する" : "メールを確認する"}
      shortCta={notSet ? "登録" : "確認"}
    />
  );
}
