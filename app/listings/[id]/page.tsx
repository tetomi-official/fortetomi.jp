"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchListingById, fetchSellerProfile, type SellerProfile } from "@/lib/listings";
import { fetchCoursesByIsbn, type SyllabusCourse } from "@/lib/syllabus";
import { createReservation } from "@/lib/reservations";
import {
  HANDOVER_TIME_LABEL,
  pickupLocationForFaculty,
  upcomingHandoverDates,
} from "@/lib/constants";
import { conditionLabel, yen, formatDate, formatSlot } from "@/lib/labels";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import type { CandidateSlot, Listing } from "@/lib/types";

const MAX_SLOTS = 3;
// PB-051: 時刻は昼休み固定。日付のみ買い手が次の1週間から選ぶ。
const emptySlot = (): CandidateSlot => ({ date: "", time: HANDOVER_TIME_LABEL });

const LIKE_KEY = "tetomi_likes";
const condTagMap: Record<string, { label: string; cls: string }> = {
  "新品・未使用": { label: "新品", cls: "cond-new" },
  "書き込みなし": { label: "書き込みなし", cls: "cond-good" },
  "書き込み少し": { label: "書き込み少し", cls: "cond-few" },
  "汚れ・ダメージあり": { label: "汚れあり", cls: "cond-worn" },
};
const statusTagMap: Record<string, { label: string; cls: string }> = {
  "出品中": { label: "出品中", cls: "status-active-tag" },
  "予約済み": { label: "予約済み", cls: "status-reserved-tag" },
  "完了": { label: "取引完了", cls: "status-done-tag" },
};

export default function DetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, enrollmentActive } = useAuth();
  const { showToast } = useToast();

  const [listing, setListing] = useState<Listing | null>(null);
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [courses, setCourses] = useState<SyllabusCourse[]>([]);
  const [loading, setLoading] = useState(true);

  const [liked, setLiked] = useState(false);
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

  useEffect(() => {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem(LIKE_KEY) || "[]");
      setLiked(ids.includes(params.id));
    } catch {
      /* noop */
    }
  }, [params.id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchListingById(params.id).then(async (l) => {
      if (!active) return;
      setListing(l);
      if (l) {
        setSeller(await fetchSellerProfile(l.seller_id));
        // PB-058: この教科書が使われる授業（ISBN照合）。ISBN無し・一致無しは空。
        setCourses(l.isbn ? await fetchCoursesByIsbn(l.isbn) : []);
      }
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [params.id]);

  if (loading) {
    return (
      <main className="page-main" style={{ background: "var(--bg-gray)", minHeight: "100vh" }}>
        <div className="container">
          <div className="empty-state">
            <div className="empty-icon">
              <i className="fas fa-spinner fa-spin" style={{ fontSize: "3rem", color: "var(--navy)", opacity: 0.4 }} />
            </div>
            <h3>読み込み中…</h3>
          </div>
        </div>
      </main>
    );
  }

  if (!listing) {
    return (
      <main className="page-main" style={{ background: "var(--bg-gray)", minHeight: "100vh" }}>
        <div className="container">
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>教科書が見つかりません</h3>
            <p>URLを確認するか、一覧ページから再検索してください。</p>
            <Link href="/listings" className="btn-navy" style={{ marginTop: 20 }}>
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
    { label: "価格", value: yen(listing.price) },
    { label: "受け渡し場所", value: pickupLocation },
    { label: "出品日", value: formatDate(listing.created_at) },
    { label: "ISBN", value: listing.isbn || "—" },
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
      setLiked(willLike);
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

  const openReserve = () => {
    if (!user) {
      showToast("購入希望にはログインが必要です", "error");
      router.push("/login");
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
    <div className="detail-page-bg">
      <div className="page-header">
        <div className="page-header-inner">
          <div className="breadcrumb">
            <Link href="/">Home</Link>
            <i className="fas fa-chevron-right" style={{ fontSize: 9 }} />
            <Link href="/listings">Books</Link>
            <i className="fas fa-chevron-right" style={{ fontSize: 9 }} />
            <span>{listing.title}</span>
          </div>
          <h1>{listing.title}</h1>
        </div>
      </div>

      <main className="page-main" style={{ background: "var(--bg-gray)" }}>
        <div className="container">
          <div className="detail-layout">
            {/* LEFT: image */}
            <div className="detail-gallery">
              <div className="detail-main-img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={listing.image_url || "/images/book-placeholder.jpg"} alt={listing.title} />
                <div className="detail-condition-overlay">
                  <span className={`card-condition ${cnd.cls}`}>{cnd.label}</span>
                </div>
              </div>
              <div className="views-badge">
                <i className="fas fa-eye" />
                <span>{listing.views}</span> 回閲覧
              </div>
            </div>

            {/* RIGHT: info */}
            <div className="detail-info-panel">
              <div className="detail-title-area">
                <span className={`detail-status-tag ${st.cls}`}>{st.label}</span>
                <h2 className="detail-title">{listing.title}</h2>
                <p className="detail-subject">
                  <i className="fas fa-graduation-cap" />
                  <span>{listing.subject}</span>
                </p>
              </div>

              <div className="detail-price-block">
                <span className="detail-price-num">{yen(listing.price)}</span>
                <span className="detail-price-unit">（税込）</span>
                <span className="detail-free-note">
                  <i className="fas fa-check-circle" style={{ color: "#10b981", marginRight: 4 }} />
                  送料ゼロ
                </span>
              </div>

              <div className="detail-meta-grid">
                {metas.map((m) => (
                  <div className="meta-item" key={m.label}>
                    <div className="meta-label">{m.label}</div>
                    <div className="meta-value">{m.value}</div>
                  </div>
                ))}
              </div>

              {listing.description && (
                <div className="detail-desc-block">
                  <h4>コメント</h4>
                  <p>{listing.description}</p>
                </div>
              )}

              {courses.length > 0 && (
                <div className="detail-courses-block">
                  <h4>
                    <i className="fas fa-graduation-cap" /> この教科書が使われる授業
                  </h4>
                  {courseGroups.map((g) => (
                    <div className="course-group" key={g.faculty}>
                      <div className="course-group-fac">
                        {g.faculty}
                        {g.faculty === user?.faculty && <em>（あなたの学部）</em>}
                      </div>
                      <ul>
                        {g.items.map((c) => (
                          <li key={c.id}>
                            <div className="c-row">
                              <span className="c-name">{c.course_name}</span>
                              {c.source_url && (
                                <a
                                  href={c.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="c-link"
                                >
                                  シラバス <i className="fas fa-external-link-alt" />
                                </a>
                              )}
                            </div>
                            <div className="c-sub">
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
              )}

              <div className="seller-card-enhanced">
                <div className="seller-av-lg">{(seller?.name ?? "?").charAt(0)}</div>
                <div className="seller-info-col">
                  <h4>{seller?.name ?? listing.seller_name}</h4>
                  <p>{`${seller?.faculty ?? ""} ${seller?.grade ?? ""}`.trim() || "GLOMAC学生"}</p>
                  <div className="seller-rating-row">
                    <i className="fas fa-star" />
                    <span>{seller?.rating ?? "5.0"}</span>
                    <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: 12 }}>
                      （{seller?.rating_count ?? 0}件）
                    </span>
                  </div>
                </div>
              </div>

              <div className="action-panel">
                <button className="btn-buy-main" onClick={openReserve} disabled={isSold}>
                  <i className={`fas ${isSold ? "fa-ban" : "fa-handshake"}`} />{" "}
                  {isSold ? st.label : "購入を希望する"}
                </button>
                <button className="btn-chat-seller" onClick={() => router.push("/mypage")}>
                  <i className="fas fa-comment-dots" /> 出品者にメッセージ
                </button>
                <div className="action-secondary">
                  <button className={`btn-like ${liked ? "liked" : ""}`.trim()} onClick={toggleLike}>
                    <i className="fas fa-heart" />
                    <span>{liked ? "気になる済み" : "気になる"}</span>
                  </button>
                  <button className="btn-share" onClick={share}>
                    <i className="fas fa-share-alt" /> シェア
                  </button>
                </div>
                <p className="action-note">
                  購入希望を送ると出品者に通知されます。
                  <br />
                  受け渡し場所・日時はメッセージで調整してください。
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* RESERVE MODAL */}
      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal modal-reserve">
            <button className="modal-close" onClick={() => setModalOpen(false)} aria-label="閉じる">
              <i className="fas fa-times" />
            </button>
            <div className="modal-logo">購入希望を送る</div>
            <p className="modal-sub">
              {step === "input"
                ? "受け渡しは昼休みです。都合の良い候補日を選んで送ってください（最大3件）。"
                : "以下の内容で送信します。よろしければ「購入希望を送る」を押してください。"}
            </p>
            <div className="modal-book-preview">
              <div className="modal-book-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={listing.image_url || "/images/book-placeholder.jpg"} alt={listing.title} />
              </div>
              <div className="modal-book-info">
                <h4>{listing.title}</h4>
                <p>{yen(listing.price)}</p>
              </div>
            </div>
            {step === "input" ? (
              <form onSubmit={goConfirm}>
                <div className="form-group required">
                  <label>受け渡し候補日（都合の良い順に）</label>
                  <div className="slot-list">
                    {form.slots.map((s, i) => (
                      <div className="slot-row" key={i}>
                        <div className="slot-num">{i + 1}</div>
                        <div className="slot-fields">
                          <select
                            required
                            value={s.date}
                            onChange={(e) => updateSlot(i, { date: e.target.value })}
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
                          <span className="slot-time-fixed">
                            <i className="fas fa-clock" /> {HANDOVER_TIME_LABEL}
                          </span>
                        </div>
                        {form.slots.length > 1 && (
                          <button
                            type="button"
                            className="slot-del"
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
                    <button type="button" className="slot-add" onClick={addSlot}>
                      <i className="fas fa-plus" /> 候補を追加（最大{MAX_SLOTS}件）
                    </button>
                  )}
                  <p className="form-hint">受け渡し時間は昼休みに固定です。日付のみお選びください。</p>
                </div>
                <div className="form-group required">
                  <label>希望場所</label>
                  <input
                    type="text"
                    required
                    placeholder="例：正門前、中央図書館前"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                  <p className="form-hint">
                    {user?.faculty ? `${user.faculty}の` : ""}受け渡し場所:{" "}
                    <strong>{pickupLocation}</strong>（変更も可能です）
                  </p>
                </div>
                <div className="form-group">
                  <label>メッセージ（任意）</label>
                  <textarea
                    rows={3}
                    placeholder="「〇〇の授業で使います」など一言あると喜ばれます"
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn-navy btn-full" style={{ marginTop: 8 }}>
                  <i className="fas fa-arrow-right" /> 確認へ進む
                </button>
              </form>
            ) : (
              <div>
                <div className="form-group">
                  <label>受け渡し候補</label>
                  <ol className="slot-confirm-list">
                    {form.slots.map((s, i) => (
                      <li key={i}>{formatSlot(s.date, s.time)}</li>
                    ))}
                  </ol>
                </div>
                <div className="detail-meta-grid" style={{ marginTop: 4 }}>
                  <div className="meta-item">
                    <div className="meta-label">希望場所</div>
                    <div className="meta-value">{form.location}</div>
                  </div>
                  <div className="meta-item">
                    <div className="meta-label">メッセージ</div>
                    <div className="meta-value">{form.message.trim() || "（なし）"}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setStep("input")}
                    disabled={submitting}
                  >
                    <i className="fas fa-arrow-left" /> 修正する
                  </button>
                  <button
                    type="button"
                    className="btn-navy btn-full"
                    onClick={submitReserve}
                    disabled={submitting}
                  >
                    <i className={`fas ${submitting ? "fa-spinner fa-spin" : "fa-paper-plane"}`} />{" "}
                    {submitting ? "送信中…" : "購入希望を送る"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
