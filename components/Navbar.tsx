"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useActionRequiredCount } from "@/lib/action-required";
import { loginHref } from "@/lib/redirect";

// 上部の固定ナビ。
//
// スマホ（md 未満）ではハンバーガーを押すと全画面の白いオーバーレイメニューが開く。
// ※ backdrop-filter は md 以上でのみ掛ける。filter 系は position:fixed の子要素の
//    包含ブロックを作ってしまい、全画面オーバーレイを高さ 60px のバーの中に
//    閉じ込めてしまうため。背景は bg-navy/95 でほぼ不透明なので見た目の影響はない。

const NAV_LINKS = [
  { href: "/", en: "Home", ja: "トップ" },
  { href: "/#about", en: "About", ja: "TETOMIとは" },
  { href: "/listings", en: "Books", ja: "教科書一覧" },
  { href: "/#faq", en: "FAQ", ja: "よくある質問" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const notifCount = useActionRequiredCount();
  // 運営は取引一覧と自分のマイページしか開けない（#60）。行き先が無いリンクは出さない。
  const operator = !!user?.is_admin;
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // メニュー展開中：Escape で閉じる。全画面オーバーレイなので背面スクロールは抑止する。
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  // PC 幅に広げたらメニューを閉じる。開いたまま広げるとハンバーガーが消えて
  // 閉じられなくなり、背面スクロールも止まったままになる。
  useEffect(() => {
    if (!menuOpen) return;
    const mq = window.matchMedia("(min-width: 48rem)");
    const onChange = () => {
      if (mq.matches) setMenuOpen(false);
    };
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [menuOpen]);

  // LP 以外は常にソリッド表示。LP はスクロールで切り替え。
  const isHome = pathname === "/";

  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  const solid = !isHome || scrolled;

  // メニュー内のボタンは同じ大きさに揃える（スマホ）。PC では通常の並び。
  const menuButtonBase =
    "mt-3 flex w-40 items-center justify-center gap-2 rounded-sm px-5 py-3 text-sm font-bold md:mt-0 md:w-auto md:py-2.5";

  return (
    <nav
      id="navbar"
      className={`h-[var(--nav-h)] transition-all duration-300 md:backdrop-blur-[24px] ${
        solid ? "bg-navy shadow-[0_4px_32px_rgba(20,49,74,0.4)]" : "bg-navy/95"
      }`}
    >
      <div className="mx-auto flex h-full max-w-[var(--max-w)] items-center justify-between px-4 md:px-6 lg:px-10">
        {/* 運営がロゴを押したときは取引一覧へ。トップに送っても戻されるだけなので。 */}
        <Link
          href={operator ? "/admin" : "/"}
          className="relative z-[2] flex items-center"
          aria-label="TETOMI Home"
        >
          <div
            className={`flex flex-col items-start gap-0.5 border-l-[3px] py-0.5 pl-3 ${
              menuOpen ? "border-navy" : "border-white/60"
            }`}
          >
            <span
              className={`logo-main font-en text-[1.35rem] leading-none font-black tracking-[0.18em] ${
                menuOpen ? "text-navy" : "text-white"
              }`}
            >
              TETOMI
            </span>
            <span
              className={`logo-sub mt-0.5 text-[8px] tracking-[0.12em] whitespace-nowrap ${
                menuOpen ? "text-ink-muted" : "text-white/65"
              }`}
            >
              手から手へ、教科書とつながりを
            </span>
          </div>
        </Link>

        {/* 運営は行き先が取引一覧と自分のマイページしか無いので（#60）、
            動線のメニューもハンバーガーも出さない。代わりに名前のバッジだけを
            バーに直接置く。マイページがログアウトへの入口になる。 */}
        {operator ? (
          <Link
            href="/mypage"
            className="nav-user-badge flex items-center gap-2 rounded-sm border-[1.5px] border-white/30 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/10"
          >
            <i className="fas fa-user-circle text-[15px]" aria-hidden="true" />
            <span>{user?.name}</span>
          </Link>
        ) : (
          <>
          <div
            id="navLinks"
            data-open={menuOpen}
            onClick={() => setMenuOpen(false)}
            className={`nav-overlay fixed inset-0 z-[1] flex flex-col items-end justify-center gap-1 bg-white px-8 shadow-[-4px_0_24px_rgba(20,49,74,0.12)] transition-[opacity,transform,visibility] duration-300 md:pointer-events-auto md:visible md:static md:z-auto md:translate-y-0 md:flex-row md:items-center md:gap-0 md:bg-transparent md:px-0 md:opacity-100 md:shadow-none ${
              menuOpen
                ? "visible translate-y-0 opacity-100"
                : "pointer-events-none invisible -translate-y-6 opacity-0"
            }`}
          >
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="relative flex flex-col items-end py-2.5 md:items-center md:px-4 md:py-2 md:after:absolute md:after:right-3.5 md:after:bottom-1 md:after:left-3.5 md:after:h-px md:after:origin-left md:after:scale-x-0 md:after:bg-white md:after:transition-transform md:after:duration-300 md:after:content-[''] md:hover:after:scale-x-100"
              >
                <span className="text-2xl font-semibold tracking-[0.02em] text-navy md:text-[13px] md:tracking-[0.04em] md:text-white">
                  {l.en}
                </span>
                <span className="mt-0.5 text-xs tracking-[0.06em] text-ink-muted md:mt-px md:text-[9px] md:text-white/45">
                  {l.ja}
                </span>
              </Link>
            ))}

            {!user && (
              <Link
                href={loginHref(pathname)}
                className={`${menuButtonBase} self-end border-[1.5px] border-navy text-navy transition-colors md:ml-2.5 md:self-auto md:border-white/35 md:text-white md:hover:border-white md:hover:bg-white/10`}
              >
                ログイン
              </Link>
            )}

            <Link
              href="/sell"
              className={`${menuButtonBase} self-end bg-navy text-white transition-colors md:ml-3.5 md:self-auto md:bg-white md:text-navy md:hover:bg-off-white`}
            >
              <i className="fas fa-plus" aria-hidden="true" /> 出品する
            </Link>

            {user && (
              <Link
                href="/mypage"
                id="navAvatar"
                className={`nav-user-badge relative ${menuButtonBase} self-end border-[1.5px] border-navy text-navy transition-colors md:ml-3 md:self-auto md:border-white/30 md:text-white md:hover:bg-white/10`}
              >
                <i className="fas fa-user-circle text-[15px]" aria-hidden="true" />
                <span>{user.name}</span>
                {notifCount > 0 && (
                  <span
                    className="nav-notif-badge absolute -top-1.5 -right-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ng-strong px-1.5 text-[11px] leading-none font-bold text-white ring-2 ring-white md:ring-navy"
                    aria-label={`対応待ち ${notifCount} 件`}
                  >
                    {notifCount > 9 ? "9+" : notifCount}
                  </span>
                )}
              </Link>
            )}
          </div>

          {/* 指で押せる 44×44px を確保する（見た目の右端は -mr で揃える） */}
          <button
            type="button"
            aria-label="メニュー"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="relative z-[2] -mr-2.5 flex h-11 w-11 flex-col items-center justify-center gap-[5px] md:hidden"
          >
            {/* 開いたときに3本バーを×へ変形（bar間5px＋高さ2pxで7px寄せ） */}
            <span
              className={`block h-0.5 w-6 rounded-sm transition-[transform,opacity] duration-300 ${
                menuOpen ? "translate-y-[7px] rotate-45 bg-navy" : "bg-white"
              }`}
            />
            <span
              className={`block h-0.5 w-6 rounded-sm transition-[transform,opacity] duration-300 ${
                menuOpen ? "bg-navy opacity-0" : "bg-white"
              }`}
            />
            <span
              className={`block h-0.5 w-6 rounded-sm transition-[transform,opacity] duration-300 ${
                menuOpen ? "-translate-y-[7px] -rotate-45 bg-navy" : "bg-white"
              }`}
            />
          </button>
          </>
        )}
      </div>
    </nav>
  );
}
