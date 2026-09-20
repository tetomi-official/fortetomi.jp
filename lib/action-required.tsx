"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { fetchActionRequiredCount } from "@/lib/notifications";

// 「自分の対応待ち件数」を 1 箇所で取って、ヘッダーと下タブバーの両方に配る。
//
// スマホではヘッダーのマイページバッジがハンバーガーメニューの中に隠れてしまうため、
// 下タブバーにも同じバッジを出す必要がある。それぞれが個別に数えると同じ問い合わせを
// 2 回投げることになるので、ここで 1 回だけ数えて共有する。

const ActionRequiredContext = createContext<number>(0);

export function ActionRequiredProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  // ページ遷移ごとに取り直して最新化する。未ログインは 0 に戻す。
  useEffect(() => {
    let active = true;
    const pending = user ? fetchActionRequiredCount(user.id) : Promise.resolve(0);
    pending.then((n) => {
      if (active) setCount(n);
    });
    return () => {
      active = false;
    };
  }, [user, pathname]);

  return <ActionRequiredContext.Provider value={count}>{children}</ActionRequiredContext.Provider>;
}

/** 自分の対応待ち件数（出品者宛の新規申請＋買い手宛の逆提案）。 */
export function useActionRequiredCount(): number {
  return useContext(ActionRequiredContext);
}
