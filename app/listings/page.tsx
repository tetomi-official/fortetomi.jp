"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchListings, fetchListingsByFaculty } from "@/lib/listings";
import { conditionLabel, yen, CONDITION_OPTIONS } from "@/lib/labels";
import ListingCard from "@/components/ListingCard";
import { useAuth } from "@/lib/auth";
import type { Listing } from "@/lib/types";
import { loginHref } from "@/lib/redirect";

const PAGE_SIZE = 12;

const PRICE_RANGES = [
  { value: "", label: "すべての価格" },
  { value: "0-500", label: "〜¥500" },
  { value: "500-1000", label: "¥500〜¥1,000" },
  { value: "1000-2000", label: "¥1,000〜¥2,000" },
  { value: "2000-5000", label: "¥2,000〜¥5,000" },
  { value: "5000-", label: "¥5,000〜" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "新着順" },
  { value: "price_asc", label: "価格：安い順" },
  { value: "price_desc", label: "価格：高い順" },
];

export default function ListingsPage() {
  const { user, ready } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  // どの条件（学部・本人）で読み込み終えたか。今の条件と違えば「読み込み中」。
  const listKey = user?.faculty ? `${user.faculty}:${user.id}` : "all";
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = !ready || loadedKey !== listKey;
  const all = useMemo(() => listings.filter((l) => l.status === "出品中"), [listings]);
  const [query, setQuery] = useState("");
  const [cond, setCond] = useState("");
  const [price, setPrice] = useState("");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);

  // PB-025: 未ログイン=全学 / ログイン後=自学部のみ（出品者の学部で絞る）
  useEffect(() => {
    if (!ready) return;
    let active = true;
    // ログイン時は自学部の「他の人」の出品のみ（自分の出品は除外＝マイページで確認）
    const req = user?.faculty ? fetchListingsByFaculty(user.faculty, user.id) : fetchListings();
    req.then((data) => {
      if (active) {
        setListings(data);
        setLoadedKey(listKey);
      }
    });
    return () => {
      active = false;
    };
  }, [ready, user?.faculty, user?.id, listKey]);

  const filtered = useMemo(() => {
    let list = all.filter((item) => {
      if (query && !`${item.title}${item.subject}`.toLowerCase().includes(query.toLowerCase()))
        return false;
      if (cond && item.condition !== cond) return false;
      if (price) {
        const p = Number(item.price);
        const [lo, hi] = price.split("-").map(Number);
        if (!Number.isNaN(lo) && !Number.isNaN(hi) && hi) {
          if (p < lo || p > hi) return false;
        } else if (!Number.isNaN(lo) && Number.isNaN(hi)) {
          if (p < lo) return false;
        }
      }
      return true;
    });
    if (sort === "price_asc") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "price_desc") list = [...list].sort((a, b) => b.price - a.price);
    if (sort === "newest") list = [...list].sort((a, b) => b.created_at - a.created_at);
    return list;
  }, [all, query, cond, price, sort]);

  const total = filtered.length;
  const pages = Math.ceil(total / PAGE_SIZE);
  const current = Math.min(page, Math.max(pages, 1));
  const start = (current - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const reset = () => {
    setQuery("");
    setCond("");
    setPrice("");
    setSort("newest");
    setPage(1);
  };

  const goPage = (n: number) => {
    setPage(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pageNumbers: (number | "...")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - current) <= 1) pageNumbers.push(i);
    else if (i === 2 || i === pages - 1) pageNumbers.push("...");
  }

  return (
    <>
      {/* md 以上だけの紺の見出し。md 未満は下の白地の見出しに置き換える（案1）。 */}
      <div className="page-header hidden md:block">
        <div className="page-header-inner">
          <div className="breadcrumb">
            <Link href="/">Home</Link>
            <i className="fas fa-chevron-right" style={{ fontSize: 9 }} />
            <span>Books</span>
          </div>
          <h1>教科書一覧</h1>
          {ready && user?.faculty ? <p>{`${user.faculty}の出品教科書を検索・フィルター`}</p> : null}
          {ready &&
            (user ? (
              <p
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 12,
                  padding: "6px 14px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <i className="fas fa-graduation-cap" /> {user.university} {user.faculty}
              </p>
            ) : (
              <p
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 12,
                  padding: "6px 14px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                  fontSize: 14,
                }}
              >
                <i className="fas fa-graduation-cap" /> ログインすると自学部の教科書に絞り込まれます{" "}
                <Link href={loginHref("/listings")} style={{ textDecoration: "underline", fontWeight: 600 }}>
                  ログイン
                </Link>
              </p>
            ))}
        </div>
      </div>

      {/* md 未満は白地（案1「箱を作らない」）。md 以上は今までどおり灰色の地。 */}
      <main className="page-main bg-bg-gray max-md:bg-white max-md:pt-[calc(var(--header-h)+24px)]">
        <div className="container max-md:px-4">
          {/* md 未満だけの見出し */}
          <div className="mb-4 flex flex-col gap-1 md:hidden">
            <h1 className="text-2xl leading-tight font-black text-navy">教科書一覧</h1>
            <p className="text-[13px] text-ink-muted">
              {ready
                ? user?.faculty
                  ? `${user.faculty}の出品教科書を検索・フィルター`
                  : "ログインすると自学部の教科書に絞り込まれます"
                : ""}
            </p>
          </div>

          {/* md 未満だけの検索・絞り込み（丸い検索欄＋丸いボタン。検索ボタンは出さず Enter で検索） */}
          <div className="mb-4 flex flex-col gap-4 md:hidden">
            <form role="search" onSubmit={(e) => e.preventDefault()}>
              <label className="flex h-12 items-center gap-2 rounded-full bg-bg-light px-3.5 text-ink-muted">
                <i className="fas fa-search text-base" aria-hidden="true" />
                <input
                  type="search"
                  aria-label="検索"
                  enterKeyHint="search"
                  placeholder="タイトル・授業名で検索"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  className="h-full min-w-0 grow bg-transparent text-base text-navy outline-none"
                />
              </label>
            </form>
            {/* はみ出す分は横スクロール（-mx-4 + px-4 で画面の端まで流す） */}
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <FilterPill
                label="状態"
                value={cond}
                options={[
                  { value: "", label: "すべての状態" },
                  ...CONDITION_OPTIONS.map((c) => ({ value: c, label: c })),
                ]}
                onChange={(v) => {
                  setCond(v);
                  setPage(1);
                }}
              />
              <FilterPill
                label="価格"
                value={price}
                options={PRICE_RANGES}
                onChange={(v) => {
                  setPrice(v);
                  setPage(1);
                }}
              />
              <FilterPill label="並び順" value={sort} options={SORT_OPTIONS} onChange={setSort} />
              <button
                type="button"
                onClick={reset}
                className="h-11 shrink-0 rounded-full bg-bg-light px-3.5 text-sm font-medium text-navy"
              >
                リセット
              </button>
            </div>
          </div>

          {/* SEARCH & FILTER（md 以上だけ。これまでの白いカード） */}
          <div className="search-filter-bar hidden md:block">
            <div className="search-bar">
              <input
                type="text"
                placeholder="タイトル・授業名で検索…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
              <button onClick={() => setPage(1)}>
                <i className="fas fa-search" /> 検索
              </button>
            </div>
            <div className="filter-row">
              <select
                className="filter-select"
                value={cond}
                onChange={(e) => {
                  setCond(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">すべての状態</option>
                {CONDITION_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="filter-select"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  setPage(1);
                }}
              >
                {PRICE_RANGES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <select className="filter-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button className="filter-reset" onClick={reset}>
                <i className="fas fa-undo" style={{ marginRight: 4, fontSize: 11 }} />
                リセット
              </button>
            </div>
          </div>

          {/* SORT BAR */}
          <div className="sort-bar max-md:mb-4">
            <p className="result-count">
              <strong>{total}</strong> 件
            </p>
            <div className="view-toggle max-md:hidden">
              <button
                className={`view-btn ${view === "grid" ? "active" : ""}`.trim()}
                onClick={() => setView("grid")}
                title="グリッド表示"
              >
                <i className="fas fa-th-large" />
              </button>
              <button
                className={`view-btn ${view === "list" ? "active" : ""}`.trim()}
                onClick={() => setView("list")}
                title="リスト表示"
              >
                <i className="fas fa-list" />
              </button>
            </div>
          </div>

          {/* LISTINGS */}
          {loading ? (
            <div className="empty-state">
              <div className="empty-icon">
                <i className="fas fa-spinner fa-spin" style={{ fontSize: "3rem", color: "var(--navy)", opacity: 0.4 }} />
              </div>
              <h3>読み込み中…</h3>
            </div>
          ) : pageItems.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <i className="fas fa-book-open" style={{ fontSize: "3rem", color: "var(--navy)", opacity: 0.25 }} />
              </div>
              <h3>該当する教科書がありません</h3>
              <p>条件を変えて検索してみてください。</p>
            </div>
          ) : view === "grid" ? (
            <div className="listings-grid max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-6">
              {pageItems.map((item) => (
                <ListingCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="listings-list">
              {pageItems.map((item) => (
                <ListingRow key={item.id} item={item} />
              ))}
            </div>
          )}

          {/* PAGINATION */}
          {pages > 1 && (
            <div className="pagination max-md:flex-wrap">
              <button className="page-btn" disabled={current === 1} onClick={() => goPage(current - 1)}>
                <i className="fas fa-chevron-left" />
              </button>
              {pageNumbers.map((n, i) =>
                n === "..." ? (
                  <span key={`e${i}`} style={{ color: "var(--text-muted)", padding: "0 4px" }}>
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    className={`page-btn ${n === current ? "active" : ""}`.trim()}
                    onClick={() => goPage(n)}
                  >
                    {n}
                  </button>
                ),
              )}
              <button
                className="page-btn"
                disabled={current === pages}
                onClick={() => goPage(current + 1)}
              >
                <i className="fas fa-chevron-right" />
              </button>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

/**
 * md 未満の丸い絞り込みボタン（案1）。
 * 見た目は上の span、押したときに開くのは透明で重ねた <select>。
 * select の文字を 16px にしてあるのは、下回ると iOS がタップ時に画面を勝手に拡大するため。
 */
function FilterPill({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const selected = options.find((o) => o.value === value) ?? options[0];
  return (
    <div className="relative shrink-0">
      <span className="pointer-events-none flex h-11 items-center gap-1.5 rounded-full bg-bg-light px-3.5 text-sm font-medium whitespace-nowrap text-navy">
        {selected.label}
        <i className="fas fa-chevron-down text-[11px]" aria-hidden="true" />
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full text-base opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ListingRow({ item }: { item: Listing }) {
  const c = conditionLabel(item.condition);
  return (
    <Link href={`/listings/${item.id}`} className="listing-row">
      <div className="listing-row-img">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.title} />
        ) : (
          <i className="fas fa-book" style={{ color: "var(--navy)", opacity: 0.3, fontSize: "1.8rem" }} />
        )}
      </div>
      <div className="listing-row-info">
        <div className="listing-row-title">{item.title}</div>
        <div className="listing-row-sub">
          {item.subject} ／ {item.seller_name || "不明"}
        </div>
      </div>
      <div className="listing-row-badges">
        <span className={`card-condition ${c.cls}`}>{c.label}</span>
      </div>
      <div className="listing-row-price">{yen(item.price)}</div>
    </Link>
  );
}
