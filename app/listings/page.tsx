"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchListings } from "@/lib/listings";
import { conditionLabel, yen, CONDITION_OPTIONS } from "@/lib/labels";
import ListingCard from "@/components/ListingCard";
import { useAuth } from "@/lib/auth";
import type { Listing } from "@/lib/types";

const PAGE_SIZE = 12;

const PRICE_RANGES = [
  { value: "", label: "すべての価格" },
  { value: "0-500", label: "〜¥500" },
  { value: "500-1000", label: "¥500〜¥1,000" },
  { value: "1000-2000", label: "¥1,000〜¥2,000" },
  { value: "2000-5000", label: "¥2,000〜¥5,000" },
  { value: "5000-", label: "¥5,000〜" },
];

export default function ListingsPage() {
  const { user, ready } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const all = useMemo(() => listings.filter((l) => l.status === "出品中"), [listings]);
  const [query, setQuery] = useState("");
  const [cond, setCond] = useState("");
  const [price, setPrice] = useState("");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    fetchListings().then((data) => {
      if (active) {
        setListings(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

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
      <div className="page-header">
        <div className="page-header-inner">
          <div className="breadcrumb">
            <Link href="/">Home</Link>
            <i className="fas fa-chevron-right" style={{ fontSize: 9 }} />
            <span>Books</span>
          </div>
          <h1>教科書一覧</h1>
          <p>GLOMAC内の出品教科書を検索・フィルター</p>
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
                <i className="fas fa-graduation-cap" /> ログインすると所属学部が表示されます{" "}
                <Link href="/login" style={{ textDecoration: "underline", fontWeight: 600 }}>
                  ログイン
                </Link>
              </p>
            ))}
        </div>
      </div>

      <main className="page-main" style={{ background: "var(--bg-gray)" }}>
        <div className="container">
          {/* SEARCH & FILTER */}
          <div className="search-filter-bar">
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
                <option value="newest">新着順</option>
                <option value="price_asc">価格：安い順</option>
                <option value="price_desc">価格：高い順</option>
              </select>
              <button className="filter-reset" onClick={reset}>
                <i className="fas fa-undo" style={{ marginRight: 4, fontSize: 11 }} />
                リセット
              </button>
            </div>
          </div>

          {/* SORT BAR */}
          <div className="sort-bar">
            <p className="result-count">
              <strong>{total}</strong> 件
            </p>
            <div className="view-toggle">
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
            <div className="listings-grid">
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
            <div className="pagination">
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
