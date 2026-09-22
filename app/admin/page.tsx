import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginHref } from "@/lib/redirect";
import AdminReservationList from "./AdminReservationList";
import SearchBar from "./SearchBar";
import type { AdminReservationRow } from "./types";
import { isReservationStatus } from "./types";

export const metadata: Metadata = {
  title: "取引一覧 | TETOMI 運営",
  // 運営用の画面なので検索結果に出さない。
  robots: { index: false, follow: false },
};

// 取引の中身は毎回 DB を見る（キャッシュに残さない）。
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParams = {
  q?: string;
  status?: string;
  trouble?: string;
  page?: string;
};

/**
 * 運営の取引一覧（#60）。
 *
 * 運営でない人を止める場所は3つある。ここはそのうちの2つ目。
 *   ① proxy.ts        ログインしていない人を /login へ送る
 *   ② このページ       運営でなければ notFound()
 *   ③ DB（RLS と view）運営でなければ 0 行
 *
 * ③ が本命で、① ② は「見せない」ための飾り。API を直に叩かれても、
 * service_role 鍵を使わずログイン中の人の権限のまま読むので、DB が最後に止める。
 *
 * 見つからない（404）にしているのは、403 だと「ここに管理画面がある」と
 * 教えてしまうため。
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginHref("/admin"));

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) notFound();

  const q = (params.q ?? "").trim();
  // 知らない値は無視する（?status=…を手で打たれても、絞り込みが壊れないように）。
  const status = isReservationStatus(params.status) ? params.status : "";
  const trouble = params.trouble === "1";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("admin_reservations")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  // 教科書名・買い手・出品者をまとめた search_text を1本で引く（view 側で作っている）。
  // % と _ は ilike の特殊文字なので、打った文字がそのまま探されるように逃がす。
  if (q) query = query.ilike("search_text", `%${q.replace(/[%_\\]/g, "\\$&")}%`);
  if (status) query = query.eq("status", status);
  // 「決済で困りごと」＝成立しなかった状態が記録されているもの。
  if (trouble) query = query.not("payment_status", "is", null);

  const { data, count, error } = await query;
  const rows = (data ?? []) as AdminReservationRow[];

  return (
    <main className="page-main bg-bg-light pt-[var(--header-h)] pb-8 md:bg-bg-gray md:pt-[calc(var(--header-h)+32px)] md:pb-20">
      {/* 右端は PC の縦タブ（SideTab・68px）が乗るので、その分を空けておく。
            空けないと「申込」の列が隠れる。 */}
        <div className="mx-auto w-full max-w-[1200px] px-4 md:pl-6 md:pr-[84px]">
        <header className="pt-6 pb-4 md:pt-0">
          <p className="font-en text-xs font-bold tracking-widest text-ink-muted">ADMIN</p>
          <h1 className="mt-1 text-xl font-bold text-navy md:text-2xl">取引一覧</h1>
          <p className="mt-1 text-sm text-ink-sub">
            問い合わせが来たときに、その取引で何が起きたかを確かめるための画面です。
          </p>
        </header>

        <SearchBar q={q} status={status} trouble={trouble} />

        {error ? (
          <p className="mt-6 rounded-md border border-alert-line bg-alert-bg px-4 py-3 text-sm text-alert">
            取引を読み込めませんでした。時間をおいて開き直してください。
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-ink-sub">
              {count ?? 0}件
              {(q || status || trouble) && "（絞り込み中）"}
            </p>
            <AdminReservationList rows={rows} />
            <Pager page={page} total={count ?? 0} params={params} />
          </>
        )}
      </div>
    </main>
  );
}

/** 前後のページへ。50件ずつ。1ページで収まるときは出さない。 */
function Pager({
  page,
  total,
  params,
}: {
  page: number;
  total: number;
  params: SearchParams;
}) {
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (lastPage <= 1) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.status) sp.set("status", params.status);
    if (params.trouble) sp.set("trouble", params.trouble);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `/admin?${s}` : "/admin";
  };

  const linkCls =
    "rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-navy hover:bg-off-white";

  return (
    <nav className="mt-6 flex items-center justify-center gap-3 text-sm">
      {page > 1 ? (
        <a className={linkCls} href={href(page - 1)}>
          前へ
        </a>
      ) : (
        <span className="px-4 py-2 text-ink-faint">前へ</span>
      )}
      <span className="text-ink-sub">
        {page} / {lastPage}
      </span>
      {page < lastPage ? (
        <a className={linkCls} href={href(page + 1)}>
          次へ
        </a>
      ) : (
        <span className="px-4 py-2 text-ink-faint">次へ</span>
      )}
    </nav>
  );
}
