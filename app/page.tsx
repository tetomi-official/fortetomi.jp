"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  countActiveListings,
  countActiveListingsByFaculty,
  fetchNewestListings,
} from "@/lib/listings";
import { useAuth } from "@/lib/auth";
import type { Listing } from "@/lib/types";
import ListingCard from "@/components/ListingCard";
import { RowGroup, SectionLabel } from "@/components/ListRow";

// 画面の作り（docs/mockups/mobile/V2Top.dc.html、docs/mockups/mobile/HANDOFF.md、
// docs/mockups/mobile/HANDOFF-more-screens.md、docs/decisions/mobile-ui-no-boxes.md）
//
// ■ md（768px）未満：案2「リスト型」
//   ヒーロー（写真＋紺のかぶせ）→ 検索欄と「今すぐ出品する」→ 新着3件 →
//   TETOMIの特徴（4行）→ よくある質問（開閉する行）の順に、白い行と 1px の線で並べる。
//   スライドショー・流れる文字・大きい数字は出さない。隠れる情報を無くすため、
//   特徴はスライドではなく4行すべてを並べる。
//   見出しの帯と行のまとまりは components/ListRow.tsx の共通部品を使う。
//
// ■ md 以上：これまでの LP のまま（見た目を変えない）
//   下の「md 以上」のかたまりに、もとの .hero-* / .ticker-* / .about-* /
//   .gallery-* / .big-stat-* / .faq-* をそのまま残している。

// PB-004: TETOMIの特徴。md 未満は4行、md 以上は4枚のスライド。
const FEATURES = [
  {
    tag: "01 — Direct",
    icon: "fa-hand-holding-heart",
    img: "/images/slide-1-direct.jpg",
    title: "送料・梱包ゼロの手渡し",
    desc: "対面で直接受け渡すから、配送も梱包もいりません。キャンパス内で取引が完結します。",
    cls: "slide-bg-1",
  },
  {
    tag: "02 — Save",
    icon: "fa-piggy-bank",
    img: "/images/slide-2-save.jpg",
    title: "売り手も買い手もおトク",
    desc: "中古教科書を適正価格で。買う人は安く手に入り、売る人は使わない本を現金化できます。",
    cls: "slide-bg-2",
  },
  {
    tag: "03 — Easy",
    icon: "fa-camera",
    img: "/images/slide-3-easy.jpg",
    title: "写真からかんたん出品",
    desc: "本の写真を撮るだけで情報を自動入力。出品から取引のやり取りまで、すべてオンラインで完了します。",
    cls: "slide-bg-3",
  },
  {
    tag: "04 — Safe",
    icon: "fa-shield-halved",
    img: "/images/slide-4-safe.jpg",
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
    a: "大学メールで在籍確認を行うため、対象大学の学生のみご利用いただけます。今後拡張予定です。",
  },
  {
    q: "支払い方法は？",
    a: "お支払いはクレジットカード決済のみに対応しています。現金でのやり取りには対応していません。",
  },
];

export default function HomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [slide, setSlide] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [newest, setNewest] = useState<Listing[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  // md 未満の検索欄。打った言葉を持って一覧へ移る（絞り込みは一覧側で行う）。
  const [query, setQuery] = useState("");
  // 学部別の件数は「どの学部の件数か」と一緒に持つ。ログアウトや学部の切り替えで古い数字を出さないため。
  const [facultyCountOf, setFacultyCountOf] = useState<{ faculty: string; n: number } | null>(null);
  const facultyCount =
    facultyCountOf && user?.faculty === facultyCountOf.faculty ? facultyCountOf.n : null;
  const rootRef = useRef<HTMLDivElement>(null);

  // 新着4件（出品中のみ）。md 未満は先頭3件だけ出す。
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
        if (active) setFacultyCountOf({ faculty, n });
      });
    }
    return () => {
      active = false;
    };
  }, [user]);

  // About カルーセル自動再生
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % FEATURES.length), 5000);
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

  const go = (n: number) => setSlide((n + FEATURES.length) % FEATURES.length);

  // 検索は一覧ページに任せる。打った言葉は ?q= で渡す。
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/listings?q=${encodeURIComponent(q)}` : "/listings");
  };

  // PB-005: 表示する件数とラベルをログイン状態で切り替え
  const statCount = facultyCount ?? totalCount;
  const statLabel =
    facultyCount !== null && user?.faculty
      ? `${user.faculty}で ${statCount} 冊出品中`
      : `全学で ${statCount} 冊出品中`;

  return (
    <div ref={rootRef}>
      {/* =========================================================
          md 未満：案2「リスト型」
          ========================================================= */}
      <main className="bg-bg-light pt-[var(--header-h)] md:hidden">
        {/* ヒーロー。写真の上に紺をかぶせ、文字は下に寄せる。 */}
        <section className="relative flex h-75 flex-col justify-end overflow-hidden bg-navy-dark px-4 pt-6 pb-7">
          <div
            className="absolute inset-0 bg-[url('/images/hero-hoodie.jpg')] bg-cover bg-[center_20%]"
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 bg-linear-to-t from-navy-dark/95 via-navy-dark/80 to-navy-dark/35"
            aria-hidden="true"
          />
          <div className="relative">
            <p className="mb-2 text-xs font-bold tracking-[0.2em] text-white/75">ABOUT TETOMI</p>
            <h1 className="mb-3 text-[28px] leading-[1.4] font-black text-white">
              教科書の新しい流通を、
              <br />
              学部内に。
            </h1>
            <p className="text-sm leading-[1.7] text-white/85">
              同じ学部の先輩・同期から、直接教科書を手渡しで受け取れるサービス。送料ゼロ・キャンパス内での受け渡しで、安く・かんたんに。
            </p>
          </div>
        </section>

        {/* 検索欄と「今すぐ出品する」。検索は打って Enter で一覧へ。 */}
        <div className="flex flex-col gap-2.5 border-b border-line-light bg-white p-4">
          <form role="search" onSubmit={submitSearch}>
            <label className="flex h-12 items-center gap-2 rounded-[10px] bg-bg-light px-3 text-ink-sub">
              <span aria-hidden="true">
                <i className="fas fa-search" />
              </span>
              <input
                type="search"
                aria-label="教科書を探す"
                placeholder="教科書・授業名で探す"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-base text-navy outline-none"
              />
            </label>
          </form>
          <Link
            href="/sell"
            className="flex h-12 items-center justify-center rounded-[10px] border-[1.5px] border-navy text-[15px] font-bold text-navy"
          >
            今すぐ出品する
          </Link>
        </div>

        {/* 新着。行は一覧と同じ ListingCard を使い回す。 */}
        <div className="flex items-end justify-between">
          <SectionLabel>新着の教科書</SectionLabel>
          <Link
            href="/listings"
            className="flex min-h-11 items-center gap-1 pr-4 pl-3 text-[13px] font-bold text-navy"
          >
            すべて見る
            <i className="fas fa-chevron-right text-xs" aria-hidden="true" />
          </Link>
        </div>
        {newest.length > 0 ? (
          // 行が上に 1px の線を持つので、まとまりの下だけここで閉じる。
          <div className="border-b border-line-light bg-white">
            {newest.slice(0, 3).map((item) => (
              <ListingCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="border-y border-line-light bg-white px-4 py-8 text-center text-sm text-ink-muted">
            現在出品中の教科書はありません。
          </p>
        )}

        {/* TETOMIの特徴。スライドにせず4行すべて出す。 */}
        <SectionLabel>TETOMIの特徴</SectionLabel>
        <RowGroup>
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-3.5 bg-white pt-3.5 pl-4">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy/8 text-navy"
                aria-hidden="true"
              >
                <i className={`fas ${f.icon} text-[17px]`} />
              </span>
              <span
                data-row-line
                className="flex min-w-0 flex-1 flex-col gap-0.5 border-b border-line-light pr-4 pb-3.5"
              >
                <span className="text-[15px] font-bold text-navy">{f.title}</span>
                <span className="text-[13px] leading-[1.6] text-ink-mid">{f.desc}</span>
              </span>
            </div>
          ))}
        </RowGroup>

        {/* よくある質問。開いたら本文を行の下に出す。 */}
        <SectionLabel>よくある質問</SectionLabel>
        <RowGroup>
          {FAQ.map((f, i) => (
            <div key={f.q} className="border-b border-line-light bg-white">
              <button
                type="button"
                aria-expanded={openFaq === i}
                onClick={() => setOpenFaq((cur) => (cur === i ? null : i))}
                className="flex min-h-13 w-full items-center justify-between gap-3 bg-transparent px-4 py-3 text-left text-[15px] font-bold text-navy"
              >
                {f.q}
                <i
                  className={`fas ${openFaq === i ? "fa-chevron-up" : "fa-chevron-down"} shrink-0 text-base text-ink-faint`}
                  aria-hidden="true"
                />
              </button>
              {openFaq === i && (
                <p className="px-4 pb-4 text-sm leading-[1.7] text-ink-mid">{f.a}</p>
              )}
            </div>
          ))}
        </RowGroup>

        <div className="h-6" />
      </main>

      {/* =========================================================
          md 以上：これまでの LP（見た目は変えない）
          ========================================================= */}
      <div className="hidden md:block">
        {/* HERO (PB-003) */}
        <section className="hero-section">
          <div className="hero-bg" />
          <div className="hero-bg-img" />
          <div className="hero-bg-overlay" />
          <div className="hero-inner">
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
              ["TEXTBOOK", "CONNECT", "TETOMI", "CAMPUS", "HAND TO HAND"].map((w, i) => (
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
            {FEATURES.map((g, i) => (
              <div key={i} className={`gallery-slide ${i === slide ? "active" : ""}`.trim()}>
                <div className={`slide-bg ${g.cls}`}>
                  {g.img ? (
                    <img src={g.img} alt="" loading={i === 0 ? "eager" : "lazy"} />
                  ) : (
                    <i className={`fas ${g.icon}`} aria-hidden="true" />
                  )}
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
            {FEATURES.map((_, i) => (
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
          <div
            style={{ maxWidth: "var(--max-w)", margin: "0 auto", padding: "0 40px", textAlign: "center" }}
          >
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
    </div>
  );
}
