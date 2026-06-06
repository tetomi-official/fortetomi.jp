"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getListingById, getUserById } from "@/lib/mock-data";
import { conditionLabel, yen, formatDate } from "@/lib/labels";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";

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
  const { user } = useAuth();
  const { showToast } = useToast();

  const listing = getListingById(params.id);
  const seller = listing ? getUserById(listing.seller_id) : undefined;

  const [liked, setLiked] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ date: "", time: "", location: "", message: "" });

  useEffect(() => {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem(LIKE_KEY) || "[]");
      setLiked(ids.includes(params.id));
    } catch {
      /* noop */
    }
  }, [params.id]);

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

  const metas = [
    { label: "状態", value: listing.condition },
    { label: "価格", value: yen(listing.price) },
    { label: "受け渡し場所", value: listing.location },
    { label: "出品日", value: formatDate(listing.created_at) },
    { label: "ISBN", value: listing.isbn || "—" },
    { label: "出版年", value: listing.publication_year || "—" },
  ];

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
    if (listing.seller_id === user.id) {
      showToast("自分の出品には購入希望を送れません", "error");
      return;
    }
    setModalOpen(true);
  };

  const submitReserve = (e: React.FormEvent) => {
    e.preventDefault();
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
                <span className="detail-price-unit">（税込・手数料ゼロ）</span>
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
            <p className="modal-sub">以下の内容を確認し、希望日時・メッセージを入力してください。</p>
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
            <form onSubmit={submitReserve}>
              <div className="form-group required">
                <label>希望受け渡し日</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="form-group required">
                <label>希望受け渡し時間帯</label>
                <select
                  required
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                >
                  <option value="">選択してください</option>
                  <option>午前中（9:00〜12:00）</option>
                  <option>昼頃（12:00〜14:00）</option>
                  <option>午後（14:00〜18:00）</option>
                  <option>夕方以降（18:00〜）</option>
                </select>
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
                  出品者指定の場所: <strong>{listing.location}</strong>
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
                <i className="fas fa-paper-plane" /> 購入希望を送る
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
