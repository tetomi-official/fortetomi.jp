"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { mockReservations } from "@/lib/mock-data";
import { fetchListings } from "@/lib/listings";
import { reservationBadgeClass, yen } from "@/lib/labels";
import type { Listing } from "@/lib/types";

type Tab = "dashboard" | "myListings" | "sentRes" | "receivedRes" | "profile";
const GRADES = ["1年", "2年", "3年", "4年", "院生"];

export default function MyPage() {
  const router = useRouter();
  const { user, ready, updateProfile, logout } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("dashboard");

  const [allListings, setAllListings] = useState<Listing[]>([]);
  useEffect(() => {
    let active = true;
    fetchListings().then((data) => {
      if (active) setAllListings(data);
    });
    return () => {
      active = false;
    };
  }, []);
  const myListings = useMemo(
    () => (user ? allListings.filter((l) => l.seller_id === user.id) : []),
    [user, allListings],
  );
  const sent = useMemo(
    () => (user ? mockReservations.filter((r) => r.buyer_id === user.id) : []),
    [user],
  );
  const received = useMemo(
    () => (user ? mockReservations.filter((r) => r.seller_id === user.id) : []),
    [user],
  );

  const [profile, setProfile] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    university: user?.university ?? "",
    faculty: user?.faculty ?? "",
    grade: user?.grade ?? "3年",
  });

  if (!ready) return <main className="page-main" style={{ background: "var(--bg-gray)" }} />;

  if (!user) {
    return (
      <>
        <MyHeader sub="— ログインしてください —" />
        <main className="page-main" style={{ background: "var(--bg-gray)" }}>
          <div className="container">
            <div className="panel-card">
              <div className="panel-body" style={{ textAlign: "center", padding: "56px 32px" }}>
                <div style={{ fontSize: "3rem", marginBottom: 16 }}>🔐</div>
                <h3 style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--navy)", marginBottom: 12 }}>
                  ログインが必要です
                </h3>
                <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
                  マイページを利用するにはログインしてください。
                </p>
                <Link href="/login" className="btn-navy">
                  <i className="fas fa-sign-in-alt" /> ログイン / 登録
                </Link>
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

  const stats = {
    active: myListings.filter((l) => l.status === "出品中").length,
    reserved: myListings.filter((l) => l.status === "予約済み").length,
    done: myListings.filter((l) => l.status === "完了").length,
  };
  const sentPending = sent.filter((r) => r.status === "申請中").length;
  const recvPending = received.filter((r) => r.status === "申請中").length;

  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile(profile);
    showToast("プロフィールを更新しました", "success");
    setTab("dashboard");
  };

  const onLogout = () => {
    logout();
    showToast("ログアウトしました");
    router.push("/");
  };

  const navItem = (key: Tab, icon: string, label: string, badge?: number) => (
    <div
      className={`sidebar-nav-item ${tab === key ? "active" : ""}`.trim()}
      onClick={() => setTab(key)}
    >
      <i className={`fas ${icon}`} /> {label}
      {badge ? <span className="pending-dot">{badge}</span> : null}
    </div>
  );

  return (
    <>
      <MyHeader sub={`${user.name}さんのページ`} />
      <main className="page-main" style={{ background: "var(--bg-gray)" }}>
        <div className="container">
          <div className="mypage-layout">
            {/* SIDEBAR */}
            <aside className="mypage-sidebar">
              <div className="sidebar-profile">
                <div className="sidebar-avatar">{(user.name || "?").charAt(0)}</div>
                <div className="sidebar-name">{user.name}</div>
                <div className="sidebar-univ">{`${user.faculty} ${user.grade}`.trim() || "GLOMAC学生"}</div>
                <div className="sidebar-rating">
                  <i className="fas fa-star" />
                  <span>{user.rating}</span>
                </div>
              </div>
              <nav className="sidebar-nav">
                {navItem("dashboard", "fa-chart-bar", "ダッシュボード")}
                {navItem("myListings", "fa-book", "出品中の教科書", stats.active)}
                {navItem("sentRes", "fa-paper-plane", "送った購入希望", sentPending)}
                {navItem("receivedRes", "fa-inbox", "受け取った購入希望", recvPending)}
                {navItem("profile", "fa-user-cog", "プロフィール編集")}
                <div className="sidebar-nav-item danger" onClick={onLogout}>
                  <i className="fas fa-sign-out-alt" /> ログアウト
                </div>
              </nav>
            </aside>

            {/* MAIN PANEL */}
            <div>
              {/* DASHBOARD */}
              {tab === "dashboard" && (
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>Dashboard</h3>
                    <Link href="/sell" className="btn-xs btn-xs-coral">
                      <i className="fas fa-plus" /> 新規出品
                    </Link>
                  </div>
                  <div className="panel-body">
                    <div className="stat-chips">
                      <div className="stat-chip">
                        <div className="stat-chip-num stat-active">{stats.active}</div>
                        <div className="stat-chip-label">出品中</div>
                      </div>
                      <div className="stat-chip">
                        <div className="stat-chip-num stat-reserved">{stats.reserved}</div>
                        <div className="stat-chip-label">予約済み</div>
                      </div>
                      <div className="stat-chip">
                        <div className="stat-chip-num stat-done">{stats.done}</div>
                        <div className="stat-chip-label">取引完了</div>
                      </div>
                    </div>
                    <div style={{ paddingTop: 16, borderTop: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: 14 }}>
                      <Link href="/sell" className="dash-link">
                        <div className="dash-link-icon" style={{ background: "var(--navy)" }}>
                          <i className="fas fa-plus" />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>新しく出品する</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>教科書を出品して後輩に繋げよう</div>
                        </div>
                        <i className="fas fa-chevron-right" style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 12 }} />
                      </Link>
                      <Link href="/listings" className="dash-link">
                        <div className="dash-link-icon" style={{ background: "var(--navy-mid)" }}>
                          <i className="fas fa-search" />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>教科書を探す</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>必要な教科書を検索しよう</div>
                        </div>
                        <i className="fas fa-chevron-right" style={{ marginLeft: "auto", color: "var(--text-muted)", fontSize: 12 }} />
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* MY LISTINGS */}
              {tab === "myListings" && (
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>出品中の教科書</h3>
                    <Link href="/sell" className="btn-xs btn-xs-coral">
                      <i className="fas fa-plus" /> 新規出品
                    </Link>
                  </div>
                  <div className="panel-body">
                    {myListings.length === 0 ? (
                      <EmptyBlock icon={<i className="fas fa-book-open" style={{ fontSize: "3rem", color: "var(--navy)", opacity: 0.25 }} />} title="出品中の教科書はありません">
                        <Link href="/sell" className="btn-navy">
                          <i className="fas fa-plus" /> 出品する
                        </Link>
                      </EmptyBlock>
                    ) : (
                      [...myListings]
                        .sort((a, b) => b.created_at - a.created_at)
                        .map((item) => {
                          const badge =
                            item.status === "出品中" ? "badge-confirmed" : item.status === "予約済み" ? "badge-pending" : "badge-done";
                          return (
                            <div className="listing-manage-item" key={item.id}>
                              <div className="lm-thumb" onClick={() => router.push(`/listings/${item.id}`)}>
                                <i className="fas fa-book" style={{ color: "var(--navy)", opacity: 0.3 }} />
                              </div>
                              <div className="lm-info">
                                <div className="lm-title" onClick={() => router.push(`/listings/${item.id}`)}>
                                  {item.title}
                                </div>
                                <div className="lm-sub">
                                  {item.subject} ・ <span className={`badge ${badge}`}>{item.status}</span>
                                </div>
                                <div className="lm-actions">
                                  <Link href={`/sell?edit=${item.id}`} className="btn-xs btn-xs-outline">
                                    <i className="fas fa-edit" /> 編集
                                  </Link>
                                  {item.status === "出品中" && (
                                    <button className="btn-xs btn-xs-green" onClick={() => showToast("（モック）完了にしました", "success")}>
                                      <i className="fas fa-check" /> 完了にする
                                    </button>
                                  )}
                                  <button className="btn-xs btn-xs-danger" onClick={() => showToast("（モック）削除しました")}>
                                    <i className="fas fa-trash" /> 削除
                                  </button>
                                </div>
                              </div>
                              <div className="lm-price">{yen(item.price)}</div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              )}

              {/* SENT RESERVATIONS */}
              {tab === "sentRes" && (
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>送った購入希望</h3>
                  </div>
                  <div className="panel-body">
                    {sent.length === 0 ? (
                      <EmptyBlock icon={<span style={{ fontSize: "4rem" }}>📭</span>} title="購入希望を送った教科書はありません">
                        <Link href="/listings" className="btn-navy">
                          <i className="fas fa-search" /> 教科書を探す
                        </Link>
                      </EmptyBlock>
                    ) : (
                      sent.map((r) => (
                        <div className="res-card" key={r.id}>
                          <div className="res-card-thumb">
                            <i className="fas fa-book" style={{ color: "var(--navy)", opacity: 0.3 }} />
                          </div>
                          <div className="res-card-body">
                            <div className="res-card-title">{r.listing_title}</div>
                            <div className="res-card-meta">
                              出品者：{r.seller_name}
                              <br />
                              希望日：{r.preferred_date} {r.preferred_time}
                              <br />
                              場所：{r.preferred_location}
                              {r.message && (
                                <>
                                  <br />
                                  メッセージ：{r.message}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="res-card-actions">
                            <span className={`badge ${reservationBadgeClass(r.status)}`}>{r.status}</span>
                            <div style={{ fontSize: "1rem", fontWeight: 900, color: "var(--navy)", fontFamily: "var(--font-en)" }}>
                              {yen(r.price)}
                            </div>
                            {r.status === "申請中" && (
                              <button className="btn-xs btn-xs-danger" onClick={() => showToast("（モック）キャンセルしました")}>
                                キャンセル
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* RECEIVED RESERVATIONS */}
              {tab === "receivedRes" && (
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>受け取った購入希望</h3>
                  </div>
                  <div className="panel-body">
                    {received.length === 0 ? (
                      <EmptyBlock icon={<span style={{ fontSize: "4rem" }}>📬</span>} title="受け取った購入希望はありません">
                        <p>出品中の教科書に購入希望が届くとここに表示されます。</p>
                      </EmptyBlock>
                    ) : (
                      received.map((r) => (
                        <div className="res-card" key={r.id}>
                          <div className="res-card-thumb">
                            <i className="fas fa-book" style={{ color: "var(--navy)", opacity: 0.3 }} />
                          </div>
                          <div className="res-card-body">
                            <div className="res-card-title">{r.listing_title}</div>
                            <div className="res-card-meta">
                              購入希望者：{r.buyer_name}
                              <br />
                              希望日：{r.preferred_date} {r.preferred_time}
                              <br />
                              場所：{r.preferred_location}
                              {r.message && (
                                <>
                                  <br />
                                  メッセージ：{r.message}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="res-card-actions">
                            <span className={`badge ${reservationBadgeClass(r.status)}`}>{r.status}</span>
                            <div style={{ fontSize: "1rem", fontWeight: 900, color: "var(--navy)", fontFamily: "var(--font-en)" }}>
                              {yen(r.price)}
                            </div>
                            {r.status === "申請中" && (
                              <>
                                <button className="btn-xs btn-xs-navy" onClick={() => showToast("（モック）承認しました", "success")}>
                                  <i className="fas fa-check" /> 承認
                                </button>
                                <button className="btn-xs btn-xs-danger" onClick={() => showToast("（モック）断りました")}>
                                  <i className="fas fa-times" /> 断る
                                </button>
                              </>
                            )}
                            {r.status === "承認済み" && (
                              <button className="btn-xs btn-xs-green" onClick={() => showToast("（モック）取引完了", "success")}>
                                <i className="fas fa-handshake" /> 取引完了
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* PROFILE */}
              {tab === "profile" && (
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>プロフィール編集</h3>
                  </div>
                  <div className="panel-body">
                    <form className="profile-form" onSubmit={saveProfile}>
                      <div className="form-row">
                        <div className="form-group required">
                          <label>お名前</label>
                          <input type="text" required value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                        </div>
                        <div className="form-group required">
                          <label>メールアドレス</label>
                          <input type="email" required value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>大学名</label>
                          <input type="text" value={profile.university} onChange={(e) => setProfile({ ...profile, university: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label>学部</label>
                          <input type="text" value={profile.faculty} onChange={(e) => setProfile({ ...profile, faculty: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>学年</label>
                        <select value={profile.grade} onChange={(e) => setProfile({ ...profile, grade: e.target.value })}>
                          {GRADES.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                        <button type="submit" className="btn-navy">
                          <i className="fas fa-save" /> 保存する
                        </button>
                        <button type="button" onClick={() => setTab("dashboard")} className="btn-outline">
                          キャンセル
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function MyHeader({ sub }: { sub: string }) {
  return (
    <div className="page-header">
      <div className="page-header-inner">
        <div className="breadcrumb">
          <Link href="/">Home</Link>
          <i className="fas fa-chevron-right" style={{ fontSize: 9 }} />
          <span>マイページ</span>
        </div>
        <h1>マイページ</h1>
        <p>{sub}</p>
      </div>
    </div>
  );
}

function EmptyBlock({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <div style={{ marginTop: 16 }}>{children}</div>
    </div>
  );
}
