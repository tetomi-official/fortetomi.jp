"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
export default function BottomTabBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const count = useActionRequiredCount();

  const currentTab = searchParams.get("tab");

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
