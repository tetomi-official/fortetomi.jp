"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

export default function Navbar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
        <div className={`nav-links ${menuOpen ? "open" : ""}`.trim()} id="navLinks">
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
            <Link href="/mypage" className="nav-user-badge" id="navAvatar">
              <i className="fas fa-user-circle" />
              <span>{user.name}</span>
            </Link>
          )}
        </div>
        <button
          className="hamburger"
          aria-label="メニュー"
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
