"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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

// スマホの丸ボタン用の選択肢。ボタンには選んでいる値が出るので、
// 未選択のときの文字は「すべての状態」ではなく項目名そのものにする。
const COND_PILL = [
  { value: "", label: "状態" },
  ...CONDITION_OPTIONS.map((c) => ({ value: c, label: c })),
];
const PRICE_PILL = [{ value: "", label: "価格" }, ...PRICE_RANGES.slice(1)];
const SORT_PILL = [
  { value: "newest", label: "新着順" },
  { value: "price_asc", label: "安い順" },
  { value: "price_desc", label: "高い順" },
];

export default function ListingsPage() {
  // useSearchParams を使うため Suspense の境界が要る（静的生成時の制約）。
  return (
    <Suspense fallback={null}>
      <ListingsPageInner />
    </Suspense>
  );
}

function ListingsPageInner() {
  const { user, ready } = useAuth();
  const searchParams = useSearchParams();
  const [listings, setListings] = useState<Listing[]>([]);
  // どの条件（学部・本人）で読み込み終えたか。今の条件と違えば「読み込み中」。
  const listKey = user?.faculty ? `${user.faculty}:${user.id}` : "all";
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = !ready || loadedKey !== listKey;
  const all = useMemo(() => listings.filter((l) => l.status === "出品中"), [listings]);
  // トップの検索欄で打った言葉は `?q=` で渡ってくる。最初の絞り込みに入れる。
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
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

  return (
    <>
      {/* 紺のページヘッダーは md 以上だけ。スマホはヘッダー直下の検索帯にする（案2）。 */}
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

      <main className="page-main bg-bg-light pt-[var(--header-h)] pb-8 md:bg-bg-gray md:pt-[calc(var(--header-h)+32px)] md:pb-20">
        {/* スマホの検索帯。検索ボタンは出さず、打てばその場で絞り込まれる（Enter で確定）。 */}
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
          }}
          className="border-b border-line-light bg-white px-4 py-3 md:hidden"
        >
          <label className="flex h-11 items-center gap-2 rounded-[10px] bg-bg-light px-3 text-ink-muted">
            <span aria-hidden="true">
              <i className="fas fa-search" />
            </span>
            <input
              type="search"
              aria-label="教科書を検索"
              placeholder="タイトル・授業名で検索"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              className="min-w-0 flex-1 bg-transparent text-base text-navy outline-none"
            />
          </label>
          {/* 絞り込み。はみ出す分は横スクロールで逃がす。 */}
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            <FilterPill
              label="状態"
              value={cond}
              options={COND_PILL}
              onChange={(v) => {
                setCond(v);
                setPage(1);
              }}
            />
            <FilterPill
              label="価格"
              value={price}
              options={PRICE_PILL}
              onChange={(v) => {
                setPrice(v);
                setPage(1);
              }}
            />
            <FilterPill label="並び順" value={sort} options={SORT_PILL} onChange={setSort} />
          </div>
        </form>

        {/* 紺ヘッダーを出さない代わりに、未ログインの人にだけ絞り込みの案内を残す */}
        {ready && !user && (
          <p className="border-b border-line-light bg-white px-4 py-3 text-[13px] text-ink-muted md:hidden">
            ログインすると自学部の教科書に絞り込まれます{" "}
            <Link href={loginHref("/listings")} className="font-bold whitespace-nowrap text-navy underline">
              ログイン
            </Link>
          </p>
        )}

        <p className="px-4 py-3 text-[13px] text-ink-muted md:hidden">
          教科書一覧 <strong className="font-extrabold text-navy">{total}</strong> 件
        </p>

        {/* md 未満は内枠を使わず全幅にする（行を画面いっぱいに並べるため） */}
        <div className="md:container">
          {/* SEARCH & FILTER（md 以上） */}
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

          {/* SORT BAR（md 以上。スマホは上の件数の帯と、行ひとつの表示だけ） */}
          <div className="sort-bar hidden md:flex">
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
            <div className="flex flex-col md:grid md:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] md:gap-5">
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
          {pages > 1 && <Pagination current={current} pages={pages} onChange={goPage} />}
        </div>
      </main>
    </>
  );
}

/**
 * ページ送り。
 *
 * md 未満は案2（`docs/mockups/mobile/V2Footer.dc.html`）の丸ボタン。44px で、
 * 現在のページは紺塗り、前後のページは山形のアイコンボタンにする。
 * 幅 360px でも横にはみ出さないよう、スマホでは番号を「最初・現在・最後」だけに絞る
 * （いちばん多いときで 44px×5 ＋ … ×2 ＋ 隙間 ＋ 左右の余白 = 324px）。
 *
 * md 以上は今までどおりの見た目（38px の角丸ボタン）。番号は前後1ページ＋最初と最後。
 */
function Pagination({
  current,
  pages,
  onChange,
}: {
  current: number;
  pages: number;
  onChange: (n: number) => void;
}) {
  // md 以上に出す番号。前後1ページと、最初・最後。
  const wide: (number | "...")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - current) <= 1) wide.push(i);
    else if (i === 2 || i === pages - 1) wide.push("...");
  }
  // md 未満に出す番号。最初・現在・最後だけ。
  const narrow: (number | "...")[] = [];
  for (const n of [...new Set([1, current, pages])].sort((a, b) => a - b)) {
    const prev = narrow[narrow.length - 1];
    if (typeof prev === "number" && n - prev > 1) narrow.push("...");
    narrow.push(n);
  }

  // 44px の丸。現在のページだけ紺で塗るので、文字色は下で足す
  // （同じ性質を2つ書くと、どちらが勝つかがクラスの並び順では決まらない）。
  const round =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-bold disabled:pointer-events-none disabled:opacity-35";

  return (
    <>
      {/* md 未満（案2） */}
      <nav aria-label="ページ送り" className="flex items-center justify-center gap-1 p-4 md:hidden">
        <button
          type="button"
          aria-label="前のページ"
          className={`${round} text-navy`}
          disabled={current === 1}
          onClick={() => onChange(current - 1)}
        >
          <i className="fas fa-chevron-left text-lg" aria-hidden="true" />
        </button>
        {narrow.map((n, i) =>
          n === "..." ? (
            <span key={`e${i}`} className="flex w-6 shrink-0 items-center justify-center text-ink-sub">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              aria-label={`${n}ページ目`}
              aria-current={n === current ? "page" : undefined}
              className={`${round} ${n === current ? "bg-navy text-white" : "text-navy"}`}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="次のページ"
          className={`${round} text-navy`}
          disabled={current === pages}
          onClick={() => onChange(current + 1)}
        >
          <i className="fas fa-chevron-right text-lg" aria-hidden="true" />
        </button>
      </nav>

      {/* md 以上（今までどおり） */}
      <nav
        aria-label="ページ送り"
        className="mt-9 hidden flex-wrap items-center justify-center gap-1.5 md:flex"
      >
        <button
          type="button"
          aria-label="前のページ"
          className={`${PAGE_BTN} ${PAGE_BTN_OFF}`}
          disabled={current === 1}
          onClick={() => onChange(current - 1)}
        >
          <i className="fas fa-chevron-left" aria-hidden="true" />
        </button>
        {wide.map((n, i) =>
          n === "..." ? (
            <span key={`e${i}`} className="px-1 text-ink-muted">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              aria-label={`${n}ページ目`}
              aria-current={n === current ? "page" : undefined}
              className={`${PAGE_BTN} ${
                n === current ? "border-navy bg-navy text-white" : PAGE_BTN_OFF
              }`}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="次のページ"
          className={`${PAGE_BTN} ${PAGE_BTN_OFF}`}
          disabled={current === pages}
          onClick={() => onChange(current + 1)}
        >
          <i className="fas fa-chevron-right" aria-hidden="true" />
        </button>
      </nav>
    </>
  );
}

/** md 以上のページ送りのボタン（移行前の `.page-btn` と同じ見た目）。 */
const PAGE_BTN =
  "font-en flex h-[38px] min-w-[38px] items-center justify-center rounded-sm border-[1.5px] px-2 text-[13px] font-bold transition-colors disabled:pointer-events-none disabled:opacity-35";
/** 現在のページ以外の色。同じ性質（背景・文字色）を2つ書くと勝ち負けが読めないので分けてある。 */
const PAGE_BTN_OFF = "border-line bg-white text-ink-mid hover:border-navy hover:text-navy";

/**
 * スマホの絞り込みボタン（案2の丸ボタン）。
 *
 * 見えているのは丸ボタンだが、実体は透明にして重ねた <select>。こうすると
 * 端末そのままの選択画面が出て、キーボード操作にも乗る。
 * iOS は文字が 16px 未満の入力欄にふれると勝手に拡大するので、<select> 側だけ
 * 16px にしてある（見えている文字は指定どおり 14px）。
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
  onChange: (v: string) => void;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <span className="relative inline-flex shrink-0">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="peer absolute inset-0 h-full w-full text-base opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none flex h-11 items-center gap-1.5 rounded-full border border-line bg-white px-4 text-sm whitespace-nowrap text-navy peer-focus-visible:ring-2 peer-focus-visible:ring-navy">
        {selected?.label ?? label}
        <i className="fas fa-chevron-down text-[11px] text-ink-mid" aria-hidden="true" />
      </span>
    </span>
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
