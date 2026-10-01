import Link from "next/link";
import { SIDE_TAB_NAV } from "@/components/main-nav";

// PC の右端に縦置きする主動線。スマホでは幅が足りないので出さず、
// 代わりに BottomTabBar（下タブバー）が同じ行き先を受け持つ。
// 表示の境目（md = 768px）は BottomTabBar の md:hidden と対になっている。
export default function SideTab() {
  return (
    <div
      className="fixed top-1/2 right-0 z-[300] hidden -translate-y-1/2 flex-col md:flex"
      aria-hidden="true"
    >
      {SIDE_TAB_NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex w-[68px] flex-col items-center justify-center border-t border-white/15 bg-navy px-3.5 py-8 text-[15px] font-extrabold tracking-[0.14em] text-white shadow-[-4px_0_18px_rgba(20,49,74,0.25)] transition-colors [writing-mode:vertical-rl] first:border-t-0 hover:bg-navy-dark"
        >
          {item.longLabel}
        </Link>
      ))}
    </div>
  );
}
