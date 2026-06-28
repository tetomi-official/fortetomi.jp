"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  countActiveListings,
  countActiveListingsByFaculty,
  fetchNewestListings,
} from "@/lib/listings";
import { useAuth } from "@/lib/auth";
import type { Listing } from "@/lib/types";
import ListingCard from "@/components/ListingCard";

// PB-004: About TETOMI の4枚カルーセル（大見出し1行＋説明2〜3行）
const ABOUT_SLIDES = [
  {
    tag: "01 — Direct",
    icon: "fa-hand-holding-heart",
    title: "送料・梱包ゼロの手渡し",
    desc: "対面で直接受け渡すから、配送も梱包もいりません。キャンパス内で取引が完結します。",
    cls: "slide-bg-1",
  },
  {
    tag: "02 — Save",
    icon: "fa-piggy-bank",
    title: "売り手も買い手もおトク",
    desc: "中古教科書を適正価格で。買う人は安く手に入り、売る人は使わない本を現金化できます。",
    cls: "slide-bg-2",
  },
  {
    tag: "03 — Easy",
    icon: "fa-camera",
    title: "写真からかんたん出品",
    desc: "本の写真を撮るだけで情報を自動入力。出品から取引のやり取りまで、すべてオンラインで完了します。",
    cls: "slide-bg-3",
  },
  {
    tag: "04 — Safe",
    icon: "fa-shield-halved",
    title: "大学メール認証で学内限定",
    desc: "大学メールでの在籍確認により、同じ学部の学生だけが利用できる安心の取引環境です。",
    cls: "slide-bg-4",
  },
];

// PB-006: FAQ（配送 / 手数料10% / 利用対象 / 支払いカードのみ）
const FAQ = [
  {
    q: "配送はできますか？",
    a: "TETOMIは対面手渡しに特化したサービスです。配送には対応していません。キャンパス内や最寄り駅などで直接受け渡してください。",
  },
  {
    q: "手数料はかかりますか？",
    a: "取引が成立した際に、販売価格の10%を手数料としていただきます。出品や購入希望の送信そのものは無料です。",
  },
  {
    q: "誰でも利用できますか？",
    a: "大学メールで在籍確認を行うため、対象大学（現在はGLOMAC）の学生のみご利用いただけます。今後拡張予定です。",
  },
  {
    q: "支払い方法は？",
    a: "お支払いはクレジットカード決済のみに対応しています。現金でのやり取りには対応していません。",
  },
];

export default function HomePage() {
  const { user } = useAuth();
  const [slide, setSlide] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [newest, setNewest] = useState<Listing[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [facultyCount, setFacultyCount] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // 新着4件（出品中のみ）
  useEffect(() => {
    let active = true;
    // 未ログインでも数字・新着を出すため RPC 経由（出品中＆在籍有効を上位4件）。
    fetchNewestListings(4).then((data) => {
      if (active) setNewest(data);
    });
    return () => {
      active = false;
    };
  }, []);

  // PB-005: 出品数カウンタ（未ログイン=全学 / ログイン=学部別）
  useEffect(() => {
    let active = true;
    countActiveListings().then((n) => {
      if (active) setTotalCount(n);
    });
    if (user?.faculty) {
      const faculty = user.faculty;
      countActiveListingsByFaculty(faculty).then((n) => {
        if (active) setFacultyCount(n);
      });
    } else {
      setFacultyCount(null);
    }
    return () => {
      active = false;
    };
  }, [user]);

  // About カルーセル自動再生
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % ABOUT_SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);

  // スクロールフェードイン
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll(".fade-in");
    if (!els) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const go = (n: number) => setSlide((n + ABOUT_SLIDES.length) % ABOUT_SLIDES.length);

  // PB-005: 表示する件数とラベルをログイン状態で切り替え
  const statCount = facultyCount ?? totalCount;
  const statLabel =
    facultyCount !== null && user?.faculty
      ? `${user.faculty}で ${statCount} 冊出品中`
      : `全学で ${statCount} 冊出品中`;

  return (
    <div ref={rootRef}>
      {/* HERO (PB-003) */}
      <section className="hero-section">
        <div className="hero-bg" />
        <div className="hero-bg-img" />
        <div className="hero-bg-overlay" />
        <div className="hero-inner">
          <p className="hero-eyebrow">【GLOMAC専用】教科書取引サービス</p>
          <div className="hero-logo-block" aria-label="TETOMI">
            <span className="hero-logo-main">TETOMI</span>
            <span className="hero-logo-tagline">手から手へ、教科書とつながりを</span>
          </div>
          <p className="hero-sub">
            同じ学部の先輩・同期から、直接教科書を手渡しで受け取れるサービス。
            <br />
            送料ゼロ・キャンパス内での受け渡しで、安く・かんたんに。
          </p>
          <div className="hero-btns">
            <Link href="/listings" className="btn-white btn-lg">
              <i className="fas fa-search" /> 教科書を探す
            </Link>
            <Link href="/sell" className="btn-ghost btn-lg">
              <i className="fas fa-book-open" /> 今すぐ出品する
            </Link>
          </div>
        </div>
        <div className="hero-scroll" aria-hidden="true">
          <span>Scroll</span>
          <i className="fas fa-chevron-down" />
        </div>
      </section>

      {/* TICKER */}
      <div className="ticker-section" aria-hidden="true">
        <div className="ticker-track">
          {Array.from({ length: 2 }).map((_, rep) =>
            ["TEXTBOOK", "CONNECT", "TETOMI", "GLOMAC", "CAMPUS", "HAND TO HAND"].map((w, i) => (
              <span key={`${rep}-${i}`} style={{ display: "contents" }}>
                <span className="ticker-item">{w}</span>
                <span className="ticker-item accent">×</span>
              </span>
            )),
          )}
        </div>
      </div>

      {/* ABOUT 見出し */}
      <section className="about-section" id="about">
        <div className="about-inner">
          <div className="fade-in">
            <p className="about-label">About TETOMI</p>
            <h2 className="about-h2">
              教科書の
              <br />
              新しい流通を、
              <br />
              学部内に。
            </h2>
          </div>
        </div>
      </section>

      {/* ABOUT カルーセル (PB-004) */}
      <section className="gallery-section" aria-label="TETOMIの特徴">
        <div className="gallery-slides">
          {ABOUT_SLIDES.map((g, i) => (
            <div key={i} className={`gallery-slide ${i === slide ? "active" : ""}`.trim()}>
              <div className={`slide-bg ${g.cls}`}>
                <i className={`fas ${g.icon}`} aria-hidden="true" />
              </div>
              <div className="slide-content">
                <p className="slide-tag">{g.tag}</p>
                <h3 className="slide-title">{g.title}</h3>
                <p className="slide-desc">{g.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="slide-controls">
          <button className="slide-arrow" onClick={() => go(slide - 1)} aria-label="前へ">
            <i className="fas fa-chevron-left" />
          </button>
          {ABOUT_SLIDES.map((_, i) => (
            <button
              key={i}
              className={`slide-dot ${i === slide ? "active" : ""}`.trim()}
              onClick={() => go(i)}
              aria-label={`スライド${i + 1}`}
            />
          ))}
          <button className="slide-arrow" onClick={() => go(slide + 1)} aria-label="次へ">
            <i className="fas fa-chevron-right" />
          </button>
        </div>
      </section>

      {/* BIG STAT (PB-005) */}
      <div className="big-stat-section">
        <div style={{ maxWidth: "var(--max-w)", margin: "0 auto", padding: "0 40px", textAlign: "center" }}>
          <p className="big-stat-label">{statLabel}</p>
          <span className="big-stat-num">{statCount}</span>
        </div>
      </div>

      {/* NEW LISTINGS */}
      <section className="new-listings" id="listings">
        <div className="new-listings-inner">
          <div className="nl-header">
            <h2 className="nl-title">New Listings</h2>
            <Link href="/listings" className="nl-see-all">
              すべて見る <i className="fas fa-arrow-right" />
            </Link>
          </div>
          {newest.length > 0 ? (
            <div className="listings-grid">
              {newest.map((item) => (
                <ListingCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <p className="empty-text">現在出品中の教科書はありません。</p>
          )}
        </div>
      </section>

      {/* FAQ (PB-006) */}
      <section className="faq-section" id="faq">
        <span className="faq-num">FAQ</span>
        <div className="faq-section-inner">
          <h2 className="faq-h2">よくある質問</h2>
          <div className="faq-items">
            {FAQ.map((f, i) => (
              <div key={i} className={`faq-item ${openFaq === i ? "open" : ""}`.trim()}>
                <button
                  className="faq-q"
                  onClick={() => setOpenFaq((cur) => (cur === i ? null : i))}
                  aria-expanded={openFaq === i}
                >
                  <span>{f.q}</span>
                  <i className="fas fa-chevron-down faq-icon" aria-hidden="true" />
                </button>
                <div className="faq-a">{f.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
