"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchActionRequiredCount } from "@/lib/notifications";

export default function Navbar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // PB-031：対応待ちの購入希望件数。ヘッダーのマイページにバッジ表示する。
  const [notifCount, setNotifCount] = useState(0);

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

  // ログイン中は対応待ち件数を取得。ページ遷移（pathname 変化）ごとに取り直して最新化する。
  useEffect(() => {
    let active = true;
    // 未ログインは 0 に戻す。同期 setState を避けるため Promise 経由で反映する。
    const pending = user ? fetchActionRequiredCount(user.id) : Promise.resolve(0);
    pending.then((n) => {
      if (active) setNotifCount(n);
    });
    return () => {
      active = false;
    };
  }, [user, pathname]);

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

  return (
    <nav className={`navbar ${solid ? "scrolled" : ""}`.trim()} id="navbar">
      <div className="nav-container">
        <Link href="/" className="nav-logo" aria-label="TETOMI Home">
          <div className="nav-logo-badge">
            <span className="logo-main">TETOMI</span>
            <span className="logo-sub">手から手へ、教科書とつながりを</span>
          </div>
        </Link>
        <div
          className={`nav-links ${menuOpen ? "open" : ""}`.trim()}
          id="navLinks"
          onClick={() => setMenuOpen(false)}
        >
          <Link href="/" className="nav-link-item">
            <span className="link-en">Home</span>
            <span className="link-ja">トップ</span>
          </Link>
          <Link href="/#about" className="nav-link-item">
            <span className="link-en">About</span>
            <span className="link-ja">TETOMIとは</span>
          </Link>
          <Link href="/listings" className="nav-link-item">
            <span className="link-en">Books</span>
            <span className="link-ja">教科書一覧</span>
          </Link>
          <Link href="/#faq" className="nav-link-item">
            <span className="link-en">FAQ</span>
            <span className="link-ja">よくある質問</span>
          </Link>
          {!user && (
            <Link href="/login" className="btn-login-nav" style={{ textDecoration: "none" }}>
              ログイン
            </Link>
          )}
          <Link href="/sell" className="nav-cta">
            <i className="fas fa-plus" /> 出品する
          </Link>
          {user && (
            <Link href="/mypage" className="nav-user-badge" id="navAvatar" style={{ position: "relative" }}>
              <i className="fas fa-user-circle" />
              <span>{user.name}</span>
              {notifCount > 0 && (
                <span className="nav-notif-badge" aria-label={`対応待ち ${notifCount} 件`}>
                  {notifCount > 9 ? "9+" : notifCount}
                </span>
              )}
            </Link>
          )}
        </div>
        <button
          className={`hamburger ${menuOpen ? "open" : ""}`.trim()}
          aria-label="メニュー"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </nav>
  );
}
