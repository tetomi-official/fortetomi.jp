"use client";

import { useAuth } from "@/lib/auth";

/**
 * 運営には見せない部分を包む（#60）。
 *
 * 運営は教科書を買わないし出さないので、「探す・出品・メッセージ・マイページ」の
 * 動線を出しても行き先がない（proxy が取引一覧に戻す）。押せるのに戻されるのは
 * 分かりにくいので、最初から出さない。
 *
 * 運営かどうかはログインの情報が届いてから分かるので、届くまでの一瞬は今までどおり
 * 表示する。実際に入れるかどうかは proxy がサーバー側で決めているので、この一瞬に
 * 学生向けの画面へ入れてしまうことはない。
 */
export default function HideForOperator({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.is_admin) return null;
  return <>{children}</>;
}
