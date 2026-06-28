"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { fetchListings, updateListingStatus, deleteListing } from "@/lib/listings";
import {
  fetchSentReservations,
  fetchReceivedReservations,
  updateReservationStatus,
  proposeReschedule,
  selectCandidateSlot,
} from "@/lib/reservations";
import { reservationBadgeClass, yen, formatSlot } from "@/lib/labels";
import type { Listing, Reservation, ReservationStatus } from "@/lib/types";

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
  // 購入希望は実DBから取得（PB-032）。承認/拒否後に再取得して一覧へ反映する。
  const [sent, setSent] = useState<Reservation[]>([]);
  const [received, setReceived] = useState<Reservation[]>([]);
  const [resBusyId, setResBusyId] = useState<string | null>(null);
  const [listingBusyId, setListingBusyId] = useState<string | null>(null);

  useEffect(() => {
    // 未ログイン時はログインゲートを早期 return するため、ここでの初期化は不要。
    if (!user) return;
    let active = true;
    Promise.all([
      fetchSentReservations(user.id),
      fetchReceivedReservations(user.id),
    ]).then(([s, r]) => {
      if (!active) return;
      setSent(s);
      setReceived(r);
    });
    return () => {
      active = false;
    };
  }, [user]);

  // 出品の「完了にする」：listings.status を更新し、一覧へ即時反映。
  const completeListing = async (id: string) => {
    setListingBusyId(id);
    const { error } = await updateListingStatus(id, "完了");
    setListingBusyId(null);
    if (error) {
      showToast("更新に失敗しました。時間をおいて再度お試しください。", "error");
      return;
    }
    setAllListings((prev) => prev.map((l) => (l.id === id ? { ...l, status: "完了" } : l)));
    showToast("取引完了にしました", "success");
  };

  // 出品の削除（不可逆なので確認ダイアログを挟む）。
  const removeListing = async (id: string, title: string) => {
    if (!window.confirm(`「${title}」を削除します。よろしいですか？\nこの操作は取り消せません。`)) return;
    setListingBusyId(id);
    const { error } = await deleteListing(id);
    setListingBusyId(null);
    if (error) {
      showToast("削除に失敗しました。時間をおいて再度お試しください。", "error");
      return;
    }
    setAllListings((prev) => prev.filter((l) => l.id !== id));
    showToast("出品を削除しました");
  };

  // PB-033：受け取った購入希望のステータスを更新（承認 / 断る / 取引完了）。
  const changeResStatus = async (id: string, status: ReservationStatus, okMsg: string) => {
    setResBusyId(id);
    const { error } = await updateReservationStatus(id, status);
    setResBusyId(null);
    if (error) {
      showToast("更新に失敗しました。時間をおいて再度お試しください。", "error");
      return;
    }
    setReceived((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    showToast(okMsg, status === "キャンセル" ? "" : "success");
  };

  // 機能③：送った購入希望（買い手視点）のステータス更新（提案日の承諾 / 断る）。
  const changeSentResStatus = async (id: string, status: ReservationStatus, okMsg: string) => {
    setResBusyId(id);
    const { error } = await updateReservationStatus(id, status);
    setResBusyId(null);
    if (error) {
      showToast("更新に失敗しました。時間をおいて再度お試しください。", "error");
      return;
    }
    setSent((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    showToast(okMsg, status === "キャンセル" ? "" : "success");
  };

  // 機能④：出品者が買い手の候補から選んだ index（予約 id → index）。
  const [pickSlot, setPickSlot] = useState<Record<string, number>>({});

  // 機能④：選択した候補で確定（即「承認済み」）。
  const confirmCandidate = async (id: string) => {
    const index = pickSlot[id] ?? 0;
    setResBusyId(id);
    const { error } = await selectCandidateSlot(id, index);
    setResBusyId(null);
    if (error) {
      showToast("確定に失敗しました。時間をおいて再度お試しください。", "error");
      return;
    }
    setReceived((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "承認済み", selected_slot: index } : r)),
    );
    showToast("この日時で確定しました", "success");
  };

  // 機能③：出品者が別日程を逆提案するためのインラインフォーム状態。
  const [reschedId, setReschedId] = useState<string | null>(null);
  const [reschedForm, setReschedForm] = useState({ date: "", time: "", location: "" });

  const openReschedule = (r: Reservation) => {
    setReschedId(r.id);
    // 場所は元の希望場所を初期値に（日時だけ変えたいケースが多いため）。
    setReschedForm({ date: "", time: "", location: r.preferred_location });
  };

  const submitReschedule = async (id: string) => {
    if (!reschedForm.date || !reschedForm.time || !reschedForm.location.trim()) {
      showToast("日付・時間帯・場所をすべて入力してください", "error");
      return;
    }
    setResBusyId(id);
    const { error } = await proposeReschedule(id, {
      proposedDate: reschedForm.date,
      proposedTime: reschedForm.time,
      proposedLocation: reschedForm.location.trim(),
    });
    setResBusyId(null);
    if (error) {
      showToast("提案に失敗しました。時間をおいて再度お試しください。", "error");
      return;
    }
    setReceived((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "日程調整中",
              proposed_date: reschedForm.date,
              proposed_time: reschedForm.time,
              proposed_location: reschedForm.location.trim(),
            }
          : r,
      ),
    );
    setReschedId(null);
    showToast("別の日程を提案しました", "success");
  };

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
                                  {item.status !== "完了" && (
                                    <button
                                      className="btn-xs btn-xs-green"
                                      disabled={listingBusyId === item.id}
                                      onClick={() => completeListing(item.id)}
                                    >
                                      <i className="fas fa-check" /> 完了にする
                                    </button>
                                  )}
                                  <button
                                    className="btn-xs btn-xs-danger"
                                    disabled={listingBusyId === item.id}
                                    onClick={() => removeListing(item.id, item.title)}
                                  >
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
                              {/* 機能④：候補が無い旧データのみ単一希望日を表示 */}
                              {!r.candidate_slots && (
                                <>
                                  <br />
                                  希望日：{r.preferred_date} {r.preferred_time}
                                </>
                              )}
                              <br />
                              場所：{r.preferred_location}
                              {r.message && (
                                <>
                                  <br />
                                  メッセージ：{r.message}
                                </>
                              )}
                            </div>
                            {/* 機能④：提示した候補日時の一覧（確定済みなら確定分を強調） */}
                            {r.candidate_slots && r.candidate_slots.length > 0 && (
                              <div className="candidate-pick">
                                <div className="candidate-pick-label">
                                  <i className="fas fa-calendar-alt" />{" "}
                                  {typeof r.selected_slot === "number" ? "提示した候補" : "提示した候補（出品者の選択待ち）"}
                                </div>
                                {r.candidate_slots.map((s, i) => (
                                  <div
                                    key={i}
                                    className={`candidate-row${r.selected_slot === i ? " confirmed" : ""}`}
                                  >
                                    <span className="candidate-dt">{formatSlot(s.date, s.time)}</span>
                                    {r.selected_slot === i && (
                                      <span className="candidate-confirmed-tag">
                                        <i className="fas fa-check" /> 確定
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* 機能③：出品者が別日程を提案中なら、その内容を強調表示 */}
                            {r.status === "日程調整中" && r.proposed_date && (
                              <div className="reschedule-proposal">
                                <div className="reschedule-proposal-label">
                                  <i className="fas fa-calendar-alt" /> 出品者からの提案日程
                                </div>
                                <div className="reschedule-proposal-body">
                                  日時：{r.proposed_date} {r.proposed_time}
                                  <br />
                                  場所：{r.proposed_location}
                                </div>
                              </div>
                            )}
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
                            {r.status === "日程調整中" && (
                              <>
                                <button
                                  className="btn-xs btn-xs-navy"
                                  disabled={resBusyId === r.id}
                                  onClick={() => changeSentResStatus(r.id, "承認済み", "提案された日程で承諾しました")}
                                >
                                  <i className="fas fa-check" /> この日程で承諾
                                </button>
                                <button
                                  className="btn-xs btn-xs-danger"
                                  disabled={resBusyId === r.id}
                                  onClick={() => changeSentResStatus(r.id, "キャンセル", "購入希望を取り下げました")}
                                >
                                  <i className="fas fa-times" /> 断る
                                </button>
                              </>
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
                        <div key={r.id}>
                          <div className="res-card">
                            <div className="res-card-thumb">
                              <i className="fas fa-book" style={{ color: "var(--navy)", opacity: 0.3 }} />
                            </div>
                            <div className="res-card-body">
                              <div className="res-card-title">{r.listing_title}</div>
                              <div className="res-card-meta">
                                購入希望者：{r.buyer_name}
                                {/* 機能④：候補が無い旧データのみ単一希望日を表示 */}
                                {!r.candidate_slots && (
                                  <>
                                    <br />
                                    希望日：{r.preferred_date} {r.preferred_time}
                                  </>
                                )}
                                <br />
                                場所：{r.preferred_location}
                                {r.message && (
                                  <>
                                    <br />
                                    メッセージ：{r.message}
                                  </>
                                )}
                              </div>
                              {/* 機能④：複数候補。申請中は選択UI、確定後は選ばれた候補を強調表示 */}
                              {r.candidate_slots && r.candidate_slots.length > 0 && (
                                r.status === "申請中" ? (
                                  <div className="candidate-pick">
                                    <div className="candidate-pick-label">
                                      <i className="fas fa-calendar-check" /> 受け渡し候補から1つ選んで確定
                                    </div>
                                    {r.candidate_slots.map((s, i) => {
                                      const chosen = (pickSlot[r.id] ?? 0) === i;
                                      return (
                                        <button
                                          type="button"
                                          key={i}
                                          className={`candidate-row${chosen ? " sel" : ""}`}
                                          onClick={() => setPickSlot((p) => ({ ...p, [r.id]: i }))}
                                        >
                                          <span className="candidate-radio" />
                                          <span className="candidate-dt">{formatSlot(s.date, s.time)}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  typeof r.selected_slot === "number" && r.candidate_slots[r.selected_slot] && (
                                    <div className="reschedule-proposal">
                                      <div className="reschedule-proposal-label">
                                        <i className="fas fa-calendar-check" /> 確定した日時
                                      </div>
                                      <div className="reschedule-proposal-body">
                                        {formatSlot(
                                          r.candidate_slots[r.selected_slot].date,
                                          r.candidate_slots[r.selected_slot].time,
                                        )}
                                        <br />
                                        場所：{r.preferred_location}
                                      </div>
                                    </div>
                                  )
                                )
                              )}
                              {/* 機能③：自分が提案中の日程を表示し、買い手の承諾待ちであることを示す */}
                              {r.status === "日程調整中" && r.proposed_date && (
                                <div className="reschedule-proposal">
                                  <div className="reschedule-proposal-label">
                                    <i className="fas fa-paper-plane" /> 提案した日程（買い手の承諾待ち）
                                  </div>
                                  <div className="reschedule-proposal-body">
                                    日時：{r.proposed_date} {r.proposed_time}
                                    <br />
                                    場所：{r.proposed_location}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="res-card-actions">
                              <span className={`badge ${reservationBadgeClass(r.status)}`}>{r.status}</span>
                              <div style={{ fontSize: "1rem", fontWeight: 900, color: "var(--navy)", fontFamily: "var(--font-en)" }}>
                                {yen(r.price)}
                              </div>
                              {r.status === "申請中" && (
                                <>
                                  {r.candidate_slots && r.candidate_slots.length > 0 ? (
                                    <button
                                      className="btn-xs btn-xs-navy"
                                      disabled={resBusyId === r.id}
                                      onClick={() => confirmCandidate(r.id)}
                                    >
                                      <i className="fas fa-check" /> この日時で確定
                                    </button>
                                  ) : (
                                    <button
                                      className="btn-xs btn-xs-navy"
                                      disabled={resBusyId === r.id}
                                      onClick={() => changeResStatus(r.id, "承認済み", "購入希望を承認しました")}
                                    >
                                      <i className="fas fa-check" /> 承認
                                    </button>
                                  )}
                                  <button
                                    className="btn-xs btn-xs-outline"
                                    disabled={resBusyId === r.id}
                                    onClick={() => (reschedId === r.id ? setReschedId(null) : openReschedule(r))}
                                  >
                                    <i className="fas fa-calendar-alt" /> 別の日程を提案
                                  </button>
                                  <button
                                    className="btn-xs btn-xs-danger"
                                    disabled={resBusyId === r.id}
                                    onClick={() => changeResStatus(r.id, "キャンセル", "購入希望を断りました")}
                                  >
                                    <i className="fas fa-times" /> 断る
                                  </button>
                                </>
                              )}
                              {r.status === "承認済み" && (
                                <button
                                  className="btn-xs btn-xs-green"
                                  disabled={resBusyId === r.id}
                                  onClick={() => changeResStatus(r.id, "完了", "取引完了にしました")}
                                >
                                  <i className="fas fa-handshake" /> 取引完了
                                </button>
                              )}
                            </div>
                          </div>

                          {/* 機能③：別日程の逆提案フォーム（申請中のカードでのみ開閉） */}
                          {reschedId === r.id && r.status === "申請中" && (
                            <div className="reschedule-form">
                              <div className="reschedule-form-title">
                                <i className="fas fa-calendar-alt" /> 別の受け渡し日程を提案する
                              </div>
                              <div className="form-row">
                                <div className="form-group required">
                                  <label>提案する日付</label>
                                  <input
                                    type="date"
                                    value={reschedForm.date}
                                    onChange={(e) => setReschedForm({ ...reschedForm, date: e.target.value })}
                                  />
                                </div>
                                <div className="form-group required">
                                  <label>提案する時刻</label>
                                  <input
                                    type="time"
                                    value={reschedForm.time}
                                    onChange={(e) => setReschedForm({ ...reschedForm, time: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div className="form-group required">
                                <label>受け渡し場所</label>
                                <input
                                  type="text"
                                  placeholder="例：正門前、中央図書館前"
                                  value={reschedForm.location}
                                  onChange={(e) => setReschedForm({ ...reschedForm, location: e.target.value })}
                                />
                              </div>
                              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                                <button
                                  className="btn-xs btn-xs-navy"
                                  disabled={resBusyId === r.id}
                                  onClick={() => submitReschedule(r.id)}
                                >
                                  <i className="fas fa-paper-plane" /> この日程で提案する
                                </button>
                                <button className="btn-xs btn-xs-outline" onClick={() => setReschedId(null)}>
                                  キャンセル
                                </button>
                              </div>
                            </div>
                          )}
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
