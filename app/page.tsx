"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getListings } from "@/lib/mock-data";
import ListingCard from "@/components/ListingCard";

const GALLERY = [
  {
    img: "/images/gallery-science.jpg",
    tag: "理工学部",
    title: ["数学・物理の", "教科書も充実"],
    desc: "線形代数・微積分・物理学など理系必須教科書が多数出品中。先輩の書き込みが予習の参考に。",
    cls: "slide-bg-1",
  },
  {
    img: "/images/gallery-economics.jpg",
    tag: "経済・社会学部",
    title: ["ミクロ・マクロ", "経済学テキスト"],
    desc: "経済学部の定番テキストから専門書まで。授業で実際に使った本を出品・入手できます。",
    cls: "slide-bg-2",
  },
  {
    img: "/images/gallery-language.jpg",
    tag: "文学・語学",
    title: ["英語・語学", "テキストも多数"],
    desc: "語学テキストは年度によって変わることも。出品者に確認しながら安心して取引できます。",
    cls: "slide-bg-3",
  },
];

const FAQ = [
  { q: "Q. 利用料・手数料はかかりますか？", a: "A. 一切かかりません。出品も購入希望の送信も完全無料です。" },
  { q: "Q. 配送はできますか？", a: "A. TETOMIは対面手渡しに特化したサービスです。配送には対応しておりません。" },
  { q: "Q. 誰でも利用できますか？", a: "A. 現在はGLOMACの学生を対象としています。今後拡張予定です。" },
  { q: "Q. 支払い方法は？", a: "A. 受け渡し時の現金手渡しが基本です。事前にメッセージで確認してください。" },
  {
    q: "Q. 予約後にキャンセルできますか？",
    a: "A. 相手に連絡したうえでマイページからキャンセル可能です。無断キャンセルはご遠慮ください。",
  },
];

export default function HomePage() {
  const [slide, setSlide] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = getListings().filter((l) => l.status === "出品中");
  const newest = [...active].sort((a, b) => b.created_at - a.created_at).slice(0, 4);

  // ギャラリー自動再生
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % GALLERY.length), 5000);
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

  const go = (n: number) => setSlide((n + GALLERY.length) % GALLERY.length);

  return (
    <div ref={rootRef}>
      {/* HERO */}
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
            同じ学部の先輩・同期から直接教科書を手渡しで受け取るサービス。
            <br />
            送料ゼロ・手数料ゼロで、安く・簡単に。
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
            ["TEXTBOOK", "CONNECT", "TETOMI", "GLOMAC", "FREE", "HAND TO HAND"].map((w, i) => (
              <span key={`${rep}-${i}`} style={{ display: "contents" }}>
                <span className="ticker-item">{w}</span>
                <span className="ticker-item accent">×</span>
              </span>
            )),
          )}
        </div>
      </div>

      {/* ABOUT */}
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

      {/* BIG STAT */}
      <div className="big-stat-section">
        <div style={{ maxWidth: "var(--max-w)", margin: "0 auto", padding: "0 40px", textAlign: "center" }}>
          <p className="big-stat-label">{active.length} 冊出品中</p>
          <span className="big-stat-num">{active.length}</span>
        </div>
      </div>

      {/* FEATURE 1 */}
      <section className="feature-section" id="service">
        <div className="feature-section-inner fade-in">
          <div className="feature-img-block">
            <div className="feature-img-placeholder f-img-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/feature-books.jpg" alt="教科書スタック" loading="lazy" />
            </div>
            <span className="feature-num-label">01 — Free</span>
          </div>
          <div className="feature-text-block">
            <p className="feature-eyebrow">Zero Fee</p>
            <h3 className="feature-h3">
              手数料ゼロ。
              <br />
              送料ゼロ。
            </h3>
            <p className="feature-desc">
              メルカリと違い、販売手数料は一切かかりません。対面での手渡しだから送料も不要。売値がそのままあなたの利益になります。
            </p>
            <div>
              <Link href="/listings" className="btn-navy">
                <i className="fas fa-search" /> 教科書を探す
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* QUOTE 1 */}
      <section className="quote-section">
        <div className="quote-inner">
          <span className="quote-num">01 — TETOMI</span>
          <h2 className="quote-h2">
            GLOMACの学部内で
            <br />
            完結するマッチング
          </h2>
          <p className="quote-body">同じ授業を受けた先輩から直接買える。</p>
          <p className="quote-sub">
            授業に合った教科書が確実に見つかります。
            <br />
            キャンパス内・駅前での手渡しで即日入手も。
          </p>
        </div>
      </section>

      {/* FEATURE 2 */}
      <section className="feature-section">
        <div className="feature-section-inner reverse fade-in">
          <div className="feature-img-block">
            <div className="feature-img-placeholder f-img-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/feature-handover.jpg" alt="教科書の手渡し" loading="lazy" />
            </div>
            <span className="feature-num-label">02 — Meet</span>
          </div>
          <div className="feature-text-block">
            <p className="feature-eyebrow">Direct Meeting</p>
            <h3 className="feature-h3">
              キャンパスで
              <br />
              直接手渡し。
            </h3>
            <p className="feature-desc">
              授業の合間にキャンパス内で受け渡し。重い教科書を運ぶ手間もなく、その場で中身を確認してから購入できます。
            </p>
            <div>
              <Link href="/sell" className="btn-navy">
                <i className="fas fa-book-open" /> 今すぐ出品する
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* QUOTE 2 */}
      <section className="quote-section">
        <div className="quote-inner">
          <span className="quote-num">02 — TETOMI</span>
          <h2 className="quote-h2">
            3分で出品完了。
            <br />
            最短翌日に手渡し。
          </h2>
          <p className="quote-body">写真を撮って、価格と場所を入力するだけ。</p>
          <p className="quote-sub">
            購入希望が届いたらメッセージで日時を調整。
            <br />
            シンプルな流れで誰でも使いこなせます。
          </p>
        </div>
      </section>

      {/* FEATURE 3 */}
      <section className="feature-section">
        <div className="feature-section-inner fade-in">
          <div className="feature-img-block">
            <div className="feature-img-placeholder f-img-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/feature-study.jpg" alt="教科書で勉強" loading="lazy" />
            </div>
            <span className="feature-num-label">03 — Fast</span>
          </div>
          <div className="feature-text-block">
            <p className="feature-eyebrow">Simple &amp; Fast</p>
            <h3 className="feature-h3">
              シンプルに、
              <br />
              スピーディーに。
            </h3>
            <p className="feature-desc">
              煩雑だった出品・検索・予約の流れを一本化。すべてこのサービスで完結します。
            </p>
            <div>
              <Link href="/listings" className="btn-coral">
                <i className="fas fa-rocket" /> 今すぐ使ってみる
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section className="gallery-section" aria-label="利用シーン">
        <div className="gallery-slides">
          {GALLERY.map((g, i) => (
            <div key={i} className={`gallery-slide ${i === slide ? "active" : ""}`.trim()}>
              <div className={`slide-bg ${g.cls}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.img} alt={g.tag} loading="lazy" />
              </div>
              <div className="slide-content">
                <p className="slide-tag">{g.tag}</p>
                <h3 className="slide-title">
                  {g.title[0]}
                  <br />
                  {g.title[1]}
                </h3>
                <p className="slide-desc">{g.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="slide-controls">
          <button className="slide-arrow" onClick={() => go(slide - 1)} aria-label="前へ">
            <i className="fas fa-chevron-left" />
          </button>
          {GALLERY.map((_, i) => (
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

      {/* FAQ */}
      <section className="faq-section" id="faq">
        <span className="faq-num">FAQ</span>
        <div className="faq-section-inner">
          <h2 className="faq-h2">よくある質問</h2>
          <div className="faq-items">
            {FAQ.map((f, i) => (
              <div key={i} className="faq-item">
                <div className="faq-q">{f.q}</div>
                <div className="faq-a">{f.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="cta-final">
        <div className="cta-final-inner">
          <p className="cta-final-label">Get Started</p>
          <div className="cta-items">
            <div className="cta-item">
              <div className="cta-item-img cta-img-sell">📤</div>
              <div className="cta-item-text">
                <h3>教科書を出品する</h3>
                <p>
                  不要になった教科書を出品して、後輩や同期の役に立てましょう。写真を撮って情報を入力するだけ、3分で完了。
                </p>
                <Link href="/sell" className="btn-navy" style={{ alignSelf: "flex-start" }}>
                  <i className="fas fa-plus" /> 出品する
                </Link>
              </div>
            </div>
            <div className="cta-item">
              <div className="cta-item-img cta-img-buy">🔍</div>
              <div className="cta-item-text">
                <h3>教科書を探す</h3>
                <p>授業名や教科書タイトルで検索。価格や状態でフィルターして、欲しい本を最短で見つけよう。</p>
                <Link href="/listings" className="btn-coral" style={{ alignSelf: "flex-start" }}>
                  <i className="fas fa-search" /> 教科書を探す
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
