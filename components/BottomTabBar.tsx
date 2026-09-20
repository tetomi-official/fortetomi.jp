"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useActionRequiredCount } from "@/lib/action-required";
import { loginHref } from "@/lib/redirect";
import { MAIN_NAV } from "@/components/main-nav";

// スマホの主動線。PC の縦タブ（SideTab）は幅が狭いと出せないため、
// スマホではこのバーが「探す・出品・メッセージ・マイページ」の入口になる。
//
// ・md（768px）以上では出さない。PC は従来どおり SideTab。
// ・ホームバーに潜らないよう env(safe-area-inset-bottom) 分を下に足す。
//   本文側の余白は globals.css の --bottom-nav-h（PC では 0）が受け持つ。
// ・高さは「h-14(56px) + セーフエリア」ちょうどにして --bottom-nav-h と一致させる。
//   区切り線を border で描くと 1px 増えて本文の一番下がバーに隠れるので、影で描いている。
// ・ログイン系の画面では出さない（下記）。

/**
 * 下タブバーを出さない画面。
 * ログイン・新規登録・パスワード再設定・復旧は、まだログインしていない人が
 * 目の前のこと（入力）だけに集中する画面なので、他の行き先を並べない。
 * モックの docs/mockups/mobile-v1/V1Login.dc.html にもバーは無い。
 */
const 出さない画面 = ["/login", "/signup", "/forgot-password", "/reset-password", "/recover"];

export default function BottomTabBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const count = useActionRequiredCount();

  const currentTab = searchParams.get("tab");
  const 隠す = 出さない画面.includes(pathname);

  // バーを出さない画面では、本文の下に空けている余白も消す（でないと下が 56px 空く）。
  // HeaderStack が --header-h を面倒みているのと同じやり方。
  useEffect(() => {
    if (!隠す) return;
    const root = document.documentElement;
    root.style.setProperty("--bottom-nav-h", "0px");
    return () => {
      root.style.removeProperty("--bottom-nav-h");
    };
  }, [隠す]);

  if (隠す) return null;

  return (
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 z-[400] bg-white/95 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-1px_0_var(--color-line-light)] backdrop-blur-sm md:hidden"
    >
      <ul className="mx-auto flex h-14 max-w-lg items-stretch">
        {MAIN_NAV.map((item) => {
          // マイページは「?tab=」まで見ないと、メッセージと見分けがつかない。
          const onMypage = pathname === "/mypage";
          const active = item.tab
            ? onMypage && currentTab === item.tab
            : item.href === "/mypage"
              ? onMypage && currentTab !== "messages"
              : pathname.startsWith(item.href);

          const href = item.needsAuth && !user ? loginHref(item.href) : item.href;
          const showBadge = item.badge && !!user && count > 0;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-full flex-col items-center justify-center gap-1 text-[10px] font-bold transition-colors ${
                  active ? "text-navy" : "text-ink-muted"
                }`}
              >
                <span className="relative">
                  <i className={`fas ${item.icon} text-lg`} aria-hidden="true" />
                  {showBadge && (
                    <span
                      className="absolute -top-1.5 -right-2.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ng-strong px-1 text-[10px] leading-none font-bold text-white"
                      aria-label={`対応待ち ${count} 件`}
                    >
                      {count > 9 ? "9+" : count}
                    </span>
                  )}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
