"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useMemo } from "react";
import { fetchListingById, fetchSellerProfile, type SellerProfile } from "@/lib/listings";
import { fetchCoursesByIsbn, type SyllabusCourse } from "@/lib/syllabus";
import { createReservation } from "@/lib/reservations";
import {
  HANDOVER_TIME_LABEL,
  PAYMENT_TIMING_NOTICE,
  pickupLocationForFaculty,
  upcomingHandoverDates,
} from "@/lib/constants";
import { yen, formatDate, formatSlot } from "@/lib/labels";
import { useAuth } from "@/lib/auth";
import { canReserve } from "@/lib/prerelease";
import { loginHref } from "@/lib/redirect";
import { useToast } from "@/components/Toast";
import type { CandidateSlot, Listing } from "@/lib/types";

// 画面の作り（docs/mockups/mobile/V1Detail.dc.html、docs/decisions/mobile-ui-no-boxes.md）
//
// ■ md（768px）未満：案1「余白と見出し」
//   白い1枚の地に、見出しと余白だけで区切る。カード・枠線・影でグループを囲まない。
//   紺の帯（パンくず）は出さず、画像の左上の「←」で一覧に戻る。
//   価格は本文に出さず、画面の下に固定するバー（下タブバーの上）に置く。
//   購入希望の入力は、下から出る全画面シート。入力欄は52px・文字16px
//   （16px を下回ると iOS がタップ時に勝手に拡大する）。押せるものは44px以上。
//
// ■ md 以上：これまでのカード表示のまま（見た目を変えない）
//   もとの .detail-* / .seller-card-enhanced / .action-panel などの指定を写している。
//
// 1つの DOM に両方を書き、`md:` で切り替える（components/AuthShell.tsx と同じやり方）。
// e2e が目印にしているクラス名（.btn-buy-main / .modal-reserve / .slot-row /
// .form-group とラベル文字列）は、見た目を Tailwind に移しても残すこと。

const MAX_SLOTS = 3;
// PB-051: 時刻は昼休み固定。日付のみ買い手が次の1週間から選ぶ。
const emptySlot = (): CandidateSlot => ({ date: "", time: HANDOVER_TIME_LABEL });

const LIKE_KEY = "tetomi_likes";
// 「気になる」を押したことを、同じページの表示に知らせるための合図
const LIKE_EVENT = "tetomi-likes-change";

/** 入力欄・選択欄の見た目（md未満：52px・枠なし・16px／md以上：これまでどおり）。 */
const CONTROL =
  "h-13 w-full rounded-[10px] border-0 bg-bg-light px-4 text-base text-navy outline-none " +
  "focus:bg-white md:h-auto md:rounded-sm md:border-[1.5px] md:border-line md:px-4 md:py-3 md:text-sm";

/** シートの下端に固定する主ボタン（md以上は本文の中のボタンに戻る）。 */
const SHEET_ACTION =
  "flex h-13 w-full items-center justify-center gap-2 rounded-[10px] bg-navy font-en text-base font-bold " +
  "text-white disabled:bg-line md:h-auto md:rounded-sm md:py-3.5 md:text-sm md:font-extrabold md:hover:bg-navy-dark";

/** セクション見出し（md未満だけ。md以上はもとの作りに見出しが無い）。 */
const SECTION_TITLE = "text-[17px] font-black text-navy md:hidden";

// 「気になる」はこの端末の localStorage に保存している。表示はそこから直接読む
// （読んだ値を state に写すと、最初の表示と食い違ったり二重に描画したりするため）。
function subscribeLikes(onChange: () => void) {
  window.addEventListener("storage", onChange); // 別のタブで変わったとき
  window.addEventListener(LIKE_EVENT, onChange); // このタブで押したとき
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LIKE_EVENT, onChange);
  };
}
function readLikes(): string {
  try {
    return localStorage.getItem(LIKE_KEY) || "[]";
  } catch {
    return "[]";
  }
}
const condTagMap: Record<string, { label: string; cls: string }> = {
  "新品・未使用": { label: "新品", cls: "cond-new" },
  "書き込みなし": { label: "書き込みなし", cls: "cond-good" },
  "書き込み少し": { label: "書き込み少し", cls: "cond-few" },
  "汚れ・ダメージあり": { label: "汚れあり", cls: "cond-worn" },
};
const statusTagMap: Record<string, { label: string; cls: string }> = {
  "出品中": { label: "出品中", cls: "bg-navy/8 text-navy" },
  "予約済み": { label: "予約済み", cls: "bg-navy/12 text-navy-mid" },
  "完了": { label: "取引完了", cls: "bg-bg-gray text-ink-muted" },
};

/** ラベル＋値の1項目。md未満は文字だけ、md以上はこれまでの薄い箱。 */
function MetaItem({
  label,
  value,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-0.5 md:block md:rounded-sm md:border md:border-line-light md:bg-bg-light md:px-4 md:py-3 ${className}`}
    >
      <div className="text-xs text-ink-muted md:mb-[5px] md:text-[10px] md:font-extrabold md:tracking-[0.1em] md:uppercase">
        {label}
      </div>
      <div className="text-[15px] font-bold text-navy md:text-sm">{value}</div>
    </div>
  );
}

export default function DetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, enrollmentActive } = useAuth();
  const { showToast } = useToast();

  const [listing, setListing] = useState<Listing | null>(null);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [courses, setCourses] = useState<SyllabusCourse[]>([]);
  // どの出品を読み込み終えたか。今の ID と違えば「読み込み中」。
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const loading = loadedId !== params.id;

  const likesJson = useSyncExternalStore(subscribeLikes, readLikes, () => "[]");
  const liked = useMemo(() => {
    try {
      return (JSON.parse(likesJson) as string[]).includes(params.id);
    } catch {
      return false;
    }
  }, [likesJson, params.id]);
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<"input" | "confirm">("input");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<{ slots: CandidateSlot[]; location: string; message: string }>({
    slots: [emptySlot()],
    location: "",
    message: "",
  });

  const updateSlot = (i: number, patch: Partial<CandidateSlot>) =>
    setForm((f) => ({ ...f, slots: f.slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  const addSlot = () =>
    setForm((f) => (f.slots.length >= MAX_SLOTS ? f : { ...f, slots: [...f.slots, emptySlot()] }));
  const removeSlot = (i: number) =>
    setForm((f) => ({ ...f, slots: f.slots.filter((_, idx) => idx !== i) }));

  // md 未満はこの画面だけ下にバーを固定する。その分の余白を本文の下に作らないと、
  // いちばん下のフッターがバーに隠れる。高さの出し入れは CSS 側（globals.css の
  // [data-bottom-bar]）に任せ、ここでは印を付けるだけにする。
  useEffect(() => {
    document.documentElement.setAttribute("data-bottom-bar", "");
    return () => document.documentElement.removeAttribute("data-bottom-bar");
  }, []);

  useEffect(() => {
    let active = true;
    fetchListingById(params.id).then(async (l) => {
      if (!active) return;
      setListing(l);
      if (l) {
        setSeller(await fetchSellerProfile(l.seller_id));
        // PB-058: この教科書が使われる授業（ISBN照合）。ISBN無し・一致無しは空。
        setCourses(l.isbn ? await fetchCoursesByIsbn(l.isbn) : []);
      }
      if (active) setLoadedId(params.id);
    });
    return () => {
      active = false;
    };
  }, [params.id]);

  if (loading) {
    return (
      <main className="page-main min-h-screen bg-white md:bg-bg-gray">
        <div className="container">
          <div className="empty-state">
            <div className="empty-icon">
              <i className="fas fa-spinner fa-spin text-5xl text-navy opacity-40" />
            </div>
            <h3>読み込み中…</h3>
          </div>
        </div>
      </main>
    );
  }

  if (!listing) {
    return (
      <main className="page-main min-h-screen bg-white md:bg-bg-gray">
        <div className="container">
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>教科書が見つかりません</h3>
            <p>URLを確認するか、一覧ページから再検索してください。</p>
            <Link href="/listings" className="btn-navy mt-5">
              <i className="fas fa-arrow-left" /> 一覧に戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const st = statusTagMap[listing.status] ?? statusTagMap["出品中"];
  const cnd = condTagMap[listing.condition] ?? { label: listing.condition, cls: "cond-good" };

  // PB-025: 受け渡し場所はユーザーの学部から自動決定（現状は固定値）
  const pickupLocation = pickupLocationForFaculty(user?.faculty);
  // PB-051: 受け渡し候補日の選択肢（今日から暦7日分）。時刻は昼休み固定。
  const dateOptions = upcomingHandoverDates(7);

  const metas = [
    { label: "状態", value: listing.condition },
    // 価格は md 未満では下のバーに出るので、ここでは出さない（二重になるため）。
    { label: "価格", value: yen(listing.price), pcOnly: true },
    { label: "受け渡し場所", value: pickupLocation },
    { label: "出品日", value: formatDate(listing.created_at) },
    { label: "ISBN", value: listing.isbn || "—", wide: true },
    { label: "出版年", value: listing.publication_year || "—" },
  ];

  // PB-058: 「この教科書が使われる授業」を学部でグループ化（閲覧者の学部を先頭に）。
  const courseGroups = (() => {
    const byFac = new Map<string, SyllabusCourse[]>();
    for (const c of courses) {
      const key = c.faculty ?? "その他";
      if (!byFac.has(key)) byFac.set(key, []);
      byFac.get(key)!.push(c);
    }
    return [...byFac.keys()]
      .sort((a, b) => (a === user?.faculty ? -1 : b === user?.faculty ? 1 : 0))
      .map((faculty) => ({ faculty, items: byFac.get(faculty)! }));
  })();

  const toggleLike = () => {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem(LIKE_KEY) || "[]");
      const i = ids.indexOf(params.id);
      const willLike = i === -1;
      if (willLike) ids.push(params.id);
      else ids.splice(i, 1);
      localStorage.setItem(LIKE_KEY, JSON.stringify(ids));
      window.dispatchEvent(new Event(LIKE_EVENT));
      showToast(willLike ? "気になるリストに追加しました" : "気になるリストから削除しました", willLike ? "success" : "");
    } catch {
      /* noop */
    }
  };

  const share = () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: listing.title, url: location.href }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(location.href).then(() => showToast("URLをコピーしました", "success"));
    }
  };

  // メッセージはマイページで取引ごとに行う。ログインしていなければ、先にログインしてこの本に戻る。
  const openChat = () => {
    if (!user) {
      showToast("メッセージにはログインが必要です", "error");
      router.push(loginHref(`/listings/${params.id}`));
      return;
    }
    router.push("/mypage");
  };

  const openReserve = () => {
    // プレリリース中（Phase 0）は購入導線を封鎖。UI でも非表示だが二重防御。
    if (!canReserve) return;
    if (!user) {
      showToast("購入希望にはログインが必要です", "error");
      router.push(loginHref(`/listings/${params.id}`));
      return;
    }
    // 在籍が失効していると購入不可。再認証へ誘導する。
    if (!enrollmentActive) {
      showToast("購入には大学メールの再認証が必要です", "error");
      router.push("/reverify");
      return;
    }
    if (listing.seller_id === user.id) {
      showToast("自分の出品には購入希望を送れません", "error");
      return;
    }
    // PB-025: 受け渡し場所を学部から自動入力。候補は1件にリセット。
    setForm({ slots: [emptySlot()], location: pickupLocation, message: "" });
    setStep("input");
    setModalOpen(true);
  };

  // PB-028 → PB-029: 入力内容を確認ステップへ（全候補の日付必須。時刻は昼休み固定）
  const goConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.slots.some((s) => !s.date)) {
      showToast("各候補の受け渡し日を選んでください", "error");
      return;
    }
    setStep("confirm");
  };

  // PB-029: 確認後に購入希望を送信（永続化）
  const submitReserve = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    const { error } = await createReservation(
      {
        listingId: listing.id,
        sellerId: listing.seller_id,
        price: listing.price,
        slots: form.slots,
        preferredLocation: form.location,
        message: form.message,
      },
      user.id,
    );
    setSubmitting(false);
    if (error) {
      showToast("購入希望の送信に失敗しました。時間をおいて再度お試しください。", "error");
      return;
    }
    setModalOpen(false);
    showToast("購入希望を送りました！出品者からの返信をお待ちください。", "success");
  };

  const isSold = listing.status !== "出品中";

  return (
    <div className="min-h-screen bg-white md:bg-bg-gray">
      {/* 紺の帯とパンくず。md 未満では出さない（戻るのは画像の左上の「←」）。 */}
      <div className="page-header hidden md:block">
        <div className="page-header-inner">
          <div className="breadcrumb">
            <Link href="/">Home</Link>
            <i className="fas fa-chevron-right text-[9px]" />
            <Link href="/listings">Books</Link>
            <i className="fas fa-chevron-right text-[9px]" />
            <span>{listing.title}</span>
          </div>
          <h1>{listing.title}</h1>
        </div>
      </div>

      <main className="pt-[var(--header-h)] md:bg-bg-gray md:pt-[calc(var(--header-h)+32px)] md:pb-20">
        <div className="md:mx-auto md:max-w-[var(--max-w)] md:px-6 lg:px-10">
          <div className="md:grid md:grid-cols-1 md:items-start md:gap-13 lg:grid-cols-2">
            {/* 画像。md 未満は左右の余白も角丸も無しで全幅。 */}
            <div className="md:flex md:flex-col md:gap-2.5 lg:sticky lg:top-[calc(var(--header-h)+24px)]">
              <div className="relative h-70 w-full overflow-hidden bg-bg-gray md:aspect-4/3 md:h-auto md:rounded-xl md:shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={listing.image_url || "/images/book-placeholder.jpg"}
                  alt={listing.title}
                  className="h-full w-full object-cover"
                />
                {/* md 未満はヘッダーにパンくずが無いので、ここが一覧への出口になる。 */}
                <Link
                  href="/listings"
                  aria-label="教科書一覧に戻る"
                  className="absolute top-3 left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-navy shadow-md md:hidden"
                >
                  <i className="fas fa-arrow-left" />
                </Link>
                <div className="absolute top-4 right-4 hidden md:block">
                  <span className={`card-condition ${cnd.cls}`}>{cnd.label}</span>
                </div>
              </div>
              <div className="hidden items-center justify-end gap-1.5 text-[11px] text-ink-muted md:flex">
                <i className="fas fa-eye" />
                <span>{listing.views}</span> 回閲覧
              </div>
            </div>

            {/* 本文 */}
            <div className="flex flex-col gap-8 px-4 pt-5 md:gap-6 md:px-0 md:pt-0">
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold md:px-3 md:py-1 md:text-[11px] md:font-extrabold md:tracking-[0.08em] md:uppercase ${st.cls}`}
                  >
                    {st.label}
                  </span>
                  {/* 状態は md 以上では画像の上に出している。 */}
                  <span className={`card-condition text-xs font-bold md:hidden ${cnd.cls}`}>{cnd.label}</span>
                </div>
                <h2 className="font-en text-[22px] leading-[1.35] font-black text-navy md:text-[clamp(1.4rem,2.5vw,1.9rem)] md:leading-[1.3] md:tracking-[0.01em]">
                  {listing.title}
                </h2>
                <p className="flex items-center gap-1.5 text-[13px] text-ink-muted">
                  <i className="fas fa-graduation-cap" />
                  <span>{listing.subject}</span>
                </p>
              </div>

              {/* 価格。md 未満は下のバーに出すので、ここでは出さない。 */}
              <div className="hidden items-baseline gap-2 border-y border-line-light py-5 md:flex">
                <span className="font-en text-[2.8rem] font-black text-navy">{yen(listing.price)}</span>
                <span className="text-base font-normal text-ink-muted">（税込）</span>
                <span className="ml-auto rounded-full bg-bg-light px-3 py-1 text-xs text-ink-muted">
                  <i className="fas fa-check-circle mr-1 text-ok" />
                  送料ゼロ
                </span>
              </div>

              <section className="flex flex-col gap-3 md:contents">
                <h3 className={SECTION_TITLE}>商品情報</h3>
                <div className="grid grid-cols-2 gap-4 md:gap-2.5">
                  {metas.map((m) => (
                    <MetaItem
                      key={m.label}
                      label={m.label}
                      value={m.value}
                      className={`${m.wide ? "col-span-2 md:col-span-1" : ""} ${m.pcOnly ? "hidden md:block" : ""}`}
                    />
                  ))}
                </div>
                <p className="flex items-center gap-1.5 text-xs text-ink-muted md:hidden">
                  <i className="fas fa-eye" />
                  {listing.views} 回閲覧
                </p>
              </section>

              {listing.description && (
                <section className="flex flex-col gap-3 md:block md:rounded-lg md:border md:border-line-light md:bg-white md:px-6 md:py-[22px] md:shadow-[inset_4px_0_0_var(--color-navy)]">
                  <h3 className="text-[17px] font-black text-navy md:mb-2.5 md:text-[10px] md:tracking-[0.14em] md:text-ink-muted md:uppercase">
                    <span className="md:hidden">出品者のコメント</span>
                    <span className="hidden md:inline">コメント</span>
                  </h3>
                  <p className="text-sm leading-[1.8] whitespace-pre-line text-ink md:leading-[1.85]">
                    {listing.description}
                  </p>
                </section>
              )}

              {courses.length > 0 && (
                <section className="flex flex-col gap-3 md:block md:rounded-md md:border md:border-line-light md:px-4 md:py-3.5">
                  <h3 className="flex items-center gap-2 text-[17px] font-black text-navy md:mb-2.5 md:text-sm md:font-bold">
                    <i className="fas fa-graduation-cap" /> この教科書が使われる授業
                  </h3>
                  <div className="flex flex-col gap-3">
                    {courseGroups.map((g) => (
                      <div className="flex flex-col gap-1.5" key={g.faculty}>
                        <div className="text-xs font-bold text-navy md:mb-1.5 md:border-b md:border-line-light md:pb-1">
                          {g.faculty}
                          {g.faculty === user?.faculty && (
                            <em className="ml-1 text-[11px] font-normal text-ink-muted not-italic">
                              （あなたの学部）
                            </em>
                          )}
                        </div>
                        <ul className="flex flex-col gap-2">
                          {g.items.map((c) => (
                            <li key={c.id}>
                              <div className="flex items-baseline justify-between gap-2.5">
                                <span className="text-[15px] font-bold text-navy md:text-[13px] md:font-semibold">
                                  {c.course_name}
                                </span>
                                {c.source_url && (
                                  <a
                                    href={c.source_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 text-xs font-bold whitespace-nowrap text-navy underline md:text-[11px]"
                                  >
                                    シラバス <i className="fas fa-external-link-alt" />
                                  </a>
                                )}
                              </div>
                              <div className="text-xs text-ink-muted">
                                {[
                                  c.instructor,
                                  [c.term, c.day_period].filter(Boolean).join(" "),
                                  c.year_level,
                                ]
                                  .filter(Boolean)
                                  .join("・")}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="flex flex-col gap-3 md:contents">
                <h3 className={SECTION_TITLE}>出品者</h3>
                <div className="flex items-center gap-3 md:gap-4 md:rounded-lg md:border md:border-line-light md:bg-white md:px-[22px] md:py-5">
                  <div className="font-en flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bg-light text-xl font-black text-navy md:h-14 md:w-14 md:bg-navy md:text-[1.4rem] md:text-white">
                    {(seller?.name ?? "?").charAt(0)}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-[15px] font-bold text-navy">{seller?.name ?? listing.seller_name}</h4>
                    <p className="text-[13px] text-ink-muted md:hidden">
                      {`${seller?.faculty ?? ""} ${seller?.grade ?? ""}`.trim()} ★{seller?.rating ?? "5.0"}（
                      {seller?.rating_count ?? 0}件）
                    </p>
                    <p className="hidden text-xs text-ink-muted md:mt-0.5 md:block">
                      {`${seller?.faculty ?? ""} ${seller?.grade ?? ""}`.trim()}
                    </p>
                    <div className="mt-1.5 hidden items-center gap-1 text-[13px] font-bold text-navy md:flex">
                      <i className="fas fa-star" />
                      <span>{seller?.rating ?? "5.0"}</span>
                      <span className="text-xs font-normal text-ink-muted">（{seller?.rating_count ?? 0}件）</span>
                    </div>
                  </div>
                </div>
              </section>

              <div className="flex flex-col gap-3 md:gap-2.5">
                {/* md 未満：画面の下に固定する「価格＋購入」のバー（下タブバーの上）。
                    md 以上：これまでどおり本文の中の購入ボタン。 */}
                <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h)] z-[390] flex h-19 items-center gap-3 border-t border-line-light bg-white px-4 md:static md:z-auto md:block md:h-auto md:border-0 md:bg-transparent md:px-0">
                  <div className="flex flex-col md:hidden">
                    <span className="font-en text-[22px] leading-tight font-black text-navy">
                      {yen(listing.price)}
                    </span>
                    <span className="text-xs text-ink-muted">税込・送料ゼロ</span>
                  </div>
                  <button
                    className="btn-buy-main flex h-13 flex-1 items-center justify-center gap-2 rounded-[10px] bg-navy font-en text-base font-bold text-white transition-all disabled:bg-line md:h-auto md:w-full md:gap-2.5 md:rounded-sm md:py-4 md:font-black md:tracking-[0.04em] md:hover:bg-navy-dark"
                    onClick={openReserve}
                    disabled={!canReserve || isSold}
                  >
                    {canReserve ? (
                      <>
                        <i className={`fas ${isSold ? "fa-ban" : "fa-handshake"}`} />
                        {isSold ? st.label : "購入を希望する"}
                      </>
                    ) : (
                      <>
                        <i className="fas fa-lock" /> 準備中です
                      </>
                    )}
                  </button>
                </div>

                {canReserve && (
                  <button
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-navy text-sm font-bold text-navy transition-all md:h-auto md:rounded-sm md:py-3.5 md:font-extrabold md:hover:bg-navy md:hover:text-white"
                    onClick={openChat}
                  >
                    <i className="fas fa-comment-dots" /> 出品者にメッセージ
                  </button>
                )}

                <div className="flex gap-3 md:gap-2.5">
                  <button
                    className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-[10px] border-[1.5px] text-sm font-bold transition-all md:h-auto md:rounded-sm md:py-3.5 ${
                      liked ? "border-ng bg-ng/10 text-ng" : "border-line text-ink-muted"
                    }`}
                    onClick={toggleLike}
                  >
                    <i className="fas fa-heart" />
                    <span>{liked ? "気になる済み" : "気になる"}</span>
                  </button>
                  <button
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-line text-sm font-bold text-ink-muted transition-all md:h-auto md:rounded-sm md:py-3.5 md:hover:border-navy md:hover:text-navy"
                    onClick={share}
                  >
                    <i className="fas fa-share-alt" /> シェア
                  </button>
                </div>

                <p className="text-center text-[11px] leading-relaxed text-ink-muted">
                  {canReserve ? (
                    <>
                      購入希望を送ると出品者に通知されます。
                      <br />
                      受け渡し場所・日時はメッセージで調整してください。
                      <br />
                      {PAYMENT_TIMING_NOTICE}
                    </>
                  ) : (
                    <>
                      現在プレリリース中です。
                      <br />
                      購入機能はまもなく公開します。
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 購入希望：md 未満は下から出る全画面シート、md 以上はこれまでの中央のモーダル。
          md 以上では包みを contents にして、中身がそのまま .modal の子に戻るようにしている。 */}
      {modalOpen && (
        <div
          className="modal-overlay items-end p-0 md:items-center md:p-5"
          onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div className="modal modal-reserve flex h-[calc(100dvh-40px)] w-full max-w-none flex-col overflow-hidden rounded-t-[20px] rounded-b-none p-0 md:block md:h-auto md:max-h-[92vh] md:max-w-[520px] md:overflow-y-auto md:rounded-xl md:p-10">
            <div className="flex shrink-0 items-center gap-1 px-2 pt-2 pb-1 md:contents">
              <button
                className="modal-close static flex h-11 w-11 shrink-0 items-center justify-center bg-transparent text-navy md:absolute md:h-9 md:w-9 md:bg-bg-light md:text-ink-muted"
                onClick={() => setModalOpen(false)}
                aria-label="閉じる"
              >
                <i className="fas fa-times" />
              </button>
              <span className="text-[17px] font-black text-navy md:hidden">購入希望を送る</span>
            </div>
            <div className="modal-logo hidden md:block">購入希望を送る</div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 md:contents">
              <p className="modal-sub">
                {step === "input"
                  ? "受け渡しは昼休みです。都合の良い候補日を選んで送ってください（最大3件）。"
                  : "以下の内容で送信します。よろしければ「購入希望を送る」を押してください。"}
              </p>
              <div className="mb-6 flex items-center gap-3.5 md:rounded-md md:border md:border-line-light md:bg-bg-light md:px-4 md:py-3.5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-bg-gray md:h-13 md:w-13 md:rounded-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={listing.image_url || "/images/book-placeholder.jpg"}
                    alt={listing.title}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-navy">{listing.title}</h4>
                  <p className="text-sm text-ink-muted md:mt-0.5 md:text-xs">{yen(listing.price)}</p>
                </div>
              </div>

              {step === "input" ? (
                <form id="reserve-form" onSubmit={goConfirm} className="md:contents">
                  <div className="form-group required mb-6 md:mb-[18px]">
                    <label className="mb-2 block text-[13px] font-bold tracking-normal text-navy normal-case md:mb-[7px] md:text-[11px] md:font-extrabold md:tracking-[0.08em] md:uppercase">
                      受け渡し候補日（都合の良い順に）
                    </label>
                    <div className="flex flex-col gap-2">
                      {form.slots.map((s, i) => (
                        <div className="slot-row flex items-center gap-2" key={i}>
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-light text-xs font-bold text-navy md:h-5.5 md:w-5.5 md:bg-navy md:text-[11px] md:font-extrabold md:text-white">
                            {i + 1}
                          </div>
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <select
                              required
                              value={s.date}
                              onChange={(e) => updateSlot(i, { date: e.target.value })}
                              className={`${CONTROL} min-w-0 flex-1`}
                            >
                              <option value="" disabled>
                                日付を選択
                              </option>
                              {dateOptions.map((o) => (
                                <option
                                  key={o.value}
                                  value={o.value}
                                  // 他の候補で選択済みの日付は選べないようにする
                                  disabled={form.slots.some((os, oi) => oi !== i && os.date === o.value)}
                                >
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            <span className="shrink-0 text-xs whitespace-nowrap text-ink-muted md:inline-flex md:items-center md:gap-1 md:rounded-lg md:bg-bg-gray md:px-2.5 md:py-1.5 md:font-bold md:text-navy">
                              <i className="fas fa-clock" /> {HANDOVER_TIME_LABEL}
                            </span>
                          </div>
                          {form.slots.length > 1 && (
                            <button
                              type="button"
                              className="flex h-11 w-9 shrink-0 items-center justify-center text-ink-muted"
                              aria-label="この候補を削除"
                              onClick={() => removeSlot(i)}
                            >
                              <i className="fas fa-times" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {form.slots.length < MAX_SLOTS && (
                      <button
                        type="button"
                        className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-line text-sm font-bold text-navy md:h-auto md:rounded-md md:bg-[#fafbfc] md:py-2.5 md:text-[13px] md:hover:border-navy"
                        onClick={addSlot}
                      >
                        <i className="fas fa-plus" /> 候補を追加（最大{MAX_SLOTS}件）
                      </button>
                    )}
                    <p className="form-hint">受け渡し時間は昼休みに固定です。日付のみお選びください。</p>
                  </div>

                  <div className="form-group required mb-6 md:mb-[18px]">
                    <label className="mb-2 block text-[13px] font-bold tracking-normal text-navy normal-case md:mb-[7px] md:text-[11px] md:font-extrabold md:tracking-[0.08em] md:uppercase">
                      希望場所
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="例：正門前、中央図書館前"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      className={CONTROL}
                    />
                    <p className="form-hint">
                      {user?.faculty ? `${user.faculty}の` : ""}受け渡し場所:{" "}
                      <strong>{pickupLocation}</strong>（変更も可能です）
                    </p>
                  </div>

                  <div className="form-group mb-6 md:mb-[18px]">
                    <label className="mb-2 block text-[13px] font-bold tracking-normal text-navy normal-case md:mb-[7px] md:text-[11px] md:font-extrabold md:tracking-[0.08em] md:uppercase">
                      メッセージ（任意）
                    </label>
                    <textarea
                      rows={3}
                      placeholder="「〇〇の授業で使います」など一言あると喜ばれます"
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      className={`${CONTROL} h-22 min-h-22 py-3 leading-relaxed md:h-auto md:min-h-25`}
                    />
                  </div>

                  <p className="form-hint mt-3">
                    <i className="fas fa-circle-info" /> {PAYMENT_TIMING_NOTICE}
                  </p>
                </form>
              ) : (
                <div className="md:contents">
                  <div className="form-group mb-6 md:mb-[18px]">
                    <label className="mb-2 block text-[13px] font-bold tracking-normal text-navy normal-case md:mb-[7px] md:text-[11px] md:font-extrabold md:tracking-[0.08em] md:uppercase">
                      受け渡し候補
                    </label>
                    <ol className="mt-1 list-decimal pl-5 text-sm leading-[1.8] text-navy">
                      {form.slots.map((s, i) => (
                        <li key={i}>{formatSlot(s.date, s.time)}</li>
                      ))}
                    </ol>
                  </div>
                  <div className="grid grid-cols-2 gap-4 md:mt-1 md:gap-2.5">
                    <MetaItem label="希望場所" value={form.location} />
                    <MetaItem label="メッセージ" value={form.message.trim() || "（なし）"} />
                  </div>
                  {/* 買い手が一番誤解しやすいところ。送信ボタンの直前に必ず出す。 */}
                  <p className="form-hint mt-3.5">
                    <i className="fas fa-circle-info" /> {PAYMENT_TIMING_NOTICE}
                  </p>
                </div>
              )}
            </div>

            {/* md 未満はシートの下端に固定。md 以上は本文の下に続く（contents）。 */}
            <div className="shrink-0 border-t border-line-light bg-white px-4 py-3 md:contents">
              {step === "input" ? (
                <button type="submit" form="reserve-form" className={`${SHEET_ACTION} md:mt-2`}>
                  <i className="fas fa-arrow-right" /> 確認へ進む
                </button>
              ) : (
                <div className="flex gap-2.5 md:mt-4">
                  <button
                    type="button"
                    className="flex h-13 shrink-0 items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-navy px-5 text-sm font-bold text-navy disabled:opacity-50 md:h-auto md:rounded-sm md:py-3"
                    onClick={() => setStep("input")}
                    disabled={submitting}
                  >
                    <i className="fas fa-arrow-left" /> 修正する
                  </button>
                  <button type="button" className={SHEET_ACTION} onClick={submitReserve} disabled={submitting}>
                    <i className={`fas ${submitting ? "fa-spinner fa-spin" : "fa-paper-plane"}`} />
                    {submitting ? "送信中…" : "購入希望を送る"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
