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
import { sellerNet, PLATFORM_FEE_RATE, PAYOUT_FEE_YEN } from "@/lib/constants";
import { decodePaymentQR } from "@/lib/payments";
import { canReserve } from "@/lib/prerelease";
import MessagesPanel from "@/components/MessagesPanel";
import SupportPanel from "@/components/SupportPanel";
import BarcodeScanner from "@/components/BarcodeScanner";
import { BarcodeFormat } from "@zxing/library";
import type { Listing, Reservation, ReservationStatus } from "@/lib/types";

type Tab =
  | "dashboard"
  | "myListings"
  | "sentRes"
  | "receivedRes"
  | "messages"
  | "support"
  | "profile";
const GRADES = ["1年", "2年", "3年", "4年", "院生"];

export default function MyPage() {
  const router = useRouter();
  const { user, ready, updateProfile, changeLoginEmail, logout } = useAuth();
  const { showToast } = useToast();
  // バナーからの ?tab=profile で初期タブをプロフィール編集に開く（初期値で解決）。
  const [tab, setTab] = useState<Tab>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("tab") === "profile"
      ? "profile"
      : "dashboard",
  );

  // メール切替確認からの戻り（?email_changed=1 / ?email_change=await）でトースト通知する。
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("email_changed") === "1") {
      showToast("ログイン用メールアドレスを変更しました", "success");
    } else if (q.get("email_change") === "await") {
      showToast("もう一方のメールに届いた確認リンクも開くと切替が完了します", "success");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [allListings, setAllListings] = useState<Listing[]>([]);
  useEffect(() => {
    // phase 0（制限ビュー）は各機能を出さないためデータ取得も行わない。
    if (!canReserve) return;
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
  // PB-036：出品者が受け渡しQRを読み取るスキャナの開閉。
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    // 未ログイン時はログインゲートを早期 return するため、ここでの初期化は不要。
    // phase 0（制限ビュー）でも購入希望の取得は不要。
    if (!user || !canReserve) return;
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

  // PB-036：出品者が買い手の受け渡しQRを読み取り、保存済みカードへ課金して取引を完了する。
  //   金額・当事者・nonce の検証はすべてサーバー（/api/payments/charge）が行う。
  const captureByQR = async (text: string) => {
    setScanning(false);
    const decoded = decodePaymentQR(text);
    if (!decoded) {
      showToast("QRを認識できませんでした。もう一度お試しください。", "error");
      return;
    }
    setResBusyId(decoded.reservationId);
    try {
      const res = await fetch("/api/payments/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decoded),
      });
      const data = (await res.json().catch(() => null)) as {
        chargeId?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.chargeId) {
        showToast(data?.error ?? "決済に失敗しました", "error");
        return;
      }
    } catch {
      showToast("通信エラーが発生しました", "error");
      return;
    } finally {
      setResBusyId(null);
    }
    showToast("決済が完了しました。取引完了です。", "success");
    // 完了・売り切れを反映するため再取得。
    if (user) {
      const [s, rc] = await Promise.all([
        fetchSentReservations(user.id),
        fetchReceivedReservations(user.id),
      ]);
      setSent(s);
      setReceived(rc);
    }
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

  // PB-044：ログアウトは確認画面（モーダル）を一度挟んでから実行する。
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  const [profile, setProfile] = useState({
    name: user?.name ?? "",
    university: user?.university ?? "",
    faculty: user?.faculty ?? "",
    grade: user?.grade ?? "3年",
  });

  // ログインメール変更（卒業前の個人メール切替）と復旧用アドレス編集。
  const [newLoginEmail, setNewLoginEmail] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState(user?.recovery_email ?? "");
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);

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

  // PB-045：売上残高。決済済み（paid_at あり）の受け取り予約から、手数料10%差引後の受取額を集計する。
  // 振込（PB-046）は未実装のため、ここでは「引き出し可能な残高＝これまでの受取額の総計」として表示する。
  const paidSales = received.filter((r) => r.paid_at);
  const grossSales = paidSales.reduce((s, r) => s + r.price, 0);
  const netBalance = paidSales.reduce((s, r) => s + sellerNet(r.price), 0);
  const feeTotal = grossSales - netBalance;

  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile(profile);
    showToast("プロフィールを更新しました", "success");
    setTab("dashboard");
  };

  // ログイン用メールを変更する（新アドレス宛に確認メールが飛び、開くと切替が確定する）。
  const handleChangeLoginEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailSubmitting) return;
    setEmailSubmitting(true);
    const { error } = await changeLoginEmail(newLoginEmail);
    setEmailSubmitting(false);
    if (error) {
      showToast(error, "error");
      return;
    }
    setNewLoginEmail("");
    showToast("新しいメールアドレス宛に確認メールを送りました。リンクを開くと切替が完了します。", "success");
  };

  // 復旧用アドレスを保存する。
  const handleSaveRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recoverySubmitting) return;
    setRecoverySubmitting(true);
    const { error } = await updateProfile({ recovery_email: recoveryInput.trim() });
    setRecoverySubmitting(false);
    if (error) {
      showToast(error, "error");
      return;
    }
    showToast("復旧用アドレスを更新しました", "success");
  };

  const onLogout = async () => {
    await logout();
    setLogoutConfirm(false);
    showToast("ログアウトしました");
    router.push("/");
  };

  // プレリリース phase 0（閲覧のみ）：マイページには到達できるが、使えるのはログアウトのみ。
  // 各機能は「準備中」の案内にとどめ、canReserve（phase 1）で従来のフル機能を解禁する。
  if (!canReserve) {
    return (
      <>
        <MyHeader sub={`${user.name}さんのページ`} />
        <main className="page-main" style={{ background: "var(--bg-gray)" }}>
          <div className="container">
            <div className="mypage-layout">
              {/* SIDEBAR：プロフィール概要とログアウトのみ */}
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
                  <div className="sidebar-nav-item danger" onClick={() => setLogoutConfirm(true)}>
                    <i className="fas fa-sign-out-alt" /> ログアウト
                  </div>
                </nav>
              </aside>

              {/* MAIN PANEL：準備中の案内 */}
              <div>
                <div className="panel-card">
                  <div className="panel-body" style={{ textAlign: "center", padding: "56px 32px" }}>
                    <div style={{ fontSize: "3rem", marginBottom: 16 }}>🚧</div>
                    <h3 style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--navy)", marginBottom: 12 }}>
                      マイページは準備中です
                    </h3>
                    <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 8 }}>
                      出品・購入希望・メッセージなどの各機能は順次公開予定です。
                    </p>
                    <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
                      今しばらくお待ちください。
                    </p>
                    <button type="button" className="btn-navy" onClick={() => setLogoutConfirm(true)}>
                      <i className="fas fa-sign-out-alt" /> ログアウト
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* PB-044：ログアウト確認モーダル（制限ビューでも同じ確認フローを踏む） */}
        {logoutConfirm && (
          <div className="modal-overlay" onClick={() => setLogoutConfirm(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-icon">
                <i className="fas fa-sign-out-alt" />
              </div>
              <h3 className="modal-title">ログアウトしますか？</h3>
              <p className="modal-text">
                ログアウトするとホームページに戻ります。再度ご利用にはログインが必要です。
              </p>
              <div className="modal-actions">
                <button type="button" className="btn-outline" onClick={() => setLogoutConfirm(false)}>
                  キャンセル
                </button>
                <button type="button" className="btn-navy" onClick={onLogout}>
                  <i className="fas fa-sign-out-alt" /> ログアウト
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

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
                {navItem("messages", "fa-comments", "メッセージ")}
                {navItem("support", "fa-headset", "運営サポート")}
                {navItem("profile", "fa-user-cog", "プロフィール編集")}
                <div className="sidebar-nav-item danger" onClick={() => setLogoutConfirm(true)}>
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

                    {/* PB-045：売上残高。決済済みの受取額（手数料10%差引後）を表示する。 */}
                    <div
                      style={{
                        marginTop: 20,
                        padding: 20,
                        borderRadius: 14,
                        background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-mid) 100%)",
                        color: "#fff",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ fontSize: 12, opacity: 0.85, display: "flex", alignItems: "center", gap: 6 }}>
                          <i className="fas fa-wallet" /> 売上残高（受取見込み）
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.7 }}>取引 {paidSales.length} 件</div>
                      </div>
                      <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6, letterSpacing: "0.02em" }}>
                        {yen(netBalance)}
                      </div>
                      <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, opacity: 0.85 }}>
                        <span>売上総額 {yen(grossSales)}</span>
                        <span>
                          サービス手数料（{Math.round(PLATFORM_FEE_RATE * 100)}%） −{yen(feeTotal)}
                        </span>
                      </div>
                      <div
                        style={{
                          marginTop: 14,
                          paddingTop: 12,
                          borderTop: "1px solid rgba(255,255,255,0.18)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <span style={{ fontSize: 11, opacity: 0.8 }}>
                          振込申請は準備中です（振込手数料 {yen(PAYOUT_FEE_YEN)}／回）
                        </span>
                        <button
                          type="button"
                          disabled
                          className="btn-xs"
                          style={{ background: "rgba(255,255,255,0.16)", color: "#fff", cursor: "not-allowed", opacity: 0.7 }}
                        >
                          <i className="fas fa-university" /> 振込申請
                        </button>
                      </div>
                    </div>

                    <div style={{ paddingTop: 16, marginTop: 16, borderTop: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: 14 }}>
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
                              <button
                                className="btn-xs btn-xs-danger"
                                disabled={resBusyId === r.id}
                                onClick={() => changeSentResStatus(r.id, "キャンセル", "購入希望をキャンセルしました")}
                              >
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
                            {/* PB-036：承認済みは受け渡し・支払いへ。決済済みはバッジ表示。 */}
                            {r.paid_at ? (
                              <span className="badge badge-done">
                                <i className="fas fa-check" /> 決済済み
                              </span>
                            ) : (
                              r.status === "承認済み" && (
                                <Link href={`/checkout/${r.id}`} className="btn-xs btn-xs-navy">
                                  <i className="fas fa-qrcode" /> 受け取り・支払いへ
                                </Link>
                              )
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
                                  onClick={() => setScanning(true)}
                                >
                                  <i className="fas fa-qrcode" />{" "}
                                  {resBusyId === r.id ? "決済中…" : "QRを読み取って決済"}
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

              {/* MESSAGES（PB-041）：キャンセル以外の進行中取引をスレッドとして表示 */}
              {tab === "messages" && (
                <MessagesPanel
                  user={user}
                  threads={[...received, ...sent]
                    .filter((r) => r.status !== "キャンセル")
                    .sort((a, b) => b.created_at - a.created_at)}
                />
              )}

              {/* 運営サポート（PB-042） */}
              {tab === "support" && <SupportPanel />}

              {/* PROFILE */}
              {tab === "profile" && (
                <div className="panel-card">
                  <div className="panel-header">
                    <h3>プロフィール編集</h3>
                  </div>
                  <div className="panel-body">
                    <form className="profile-form" onSubmit={saveProfile}>
                      <div className="form-group required">
                        <label>お名前</label>
                        <input type="text" required value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
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

                    {/* メールアドレス設定：ログイン用メールの変更（卒業前の切替）＋復旧用アドレス */}
                    <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border, #e5e7eb)" }}>
                      <h4 style={{ fontWeight: 800, color: "var(--navy)", marginBottom: 8 }}>
                        ログイン用メールアドレス
                      </h4>
                      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
                        現在のログインID：<strong>{user.email}</strong>
                        <br />
                        卒業などで大学メールが使えなくなる前に、個人のメールアドレスへ切り替えてください。
                      </p>
                      <form className="profile-form" onSubmit={handleChangeLoginEmail}>
                        <div className="form-group">
                          <label>新しいログイン用メールアドレス</label>
                          <input
                            type="email"
                            autoComplete="email"
                            placeholder="example@gmail.com"
                            value={newLoginEmail}
                            onChange={(e) => setNewLoginEmail(e.target.value)}
                          />
                        </div>
                        <button type="submit" className="btn-navy" disabled={emailSubmitting || !newLoginEmail}>
                          <i className="fas fa-envelope" /> {emailSubmitting ? "送信中…" : "確認メールを送る"}
                        </button>
                      </form>
                    </div>

                    <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border, #e5e7eb)" }}>
                      <h4 style={{ fontWeight: 800, color: "var(--navy)", marginBottom: 8 }}>
                        復旧用メールアドレス
                      </h4>
                      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
                        ログインできなくなった際の復旧に使う、個人の連絡先です。
                      </p>
                      <form className="profile-form" onSubmit={handleSaveRecovery}>
                        <div className="form-group">
                          <label>復旧用メールアドレス</label>
                          <input
                            type="email"
                            autoComplete="email"
                            placeholder="example@gmail.com"
                            value={recoveryInput}
                            onChange={(e) => setRecoveryInput(e.target.value)}
                          />
                        </div>
                        <button type="submit" className="btn-navy" disabled={recoverySubmitting}>
                          <i className="fas fa-save" /> {recoverySubmitting ? "保存中…" : "保存する"}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* PB-044：ログアウト確認画面（モーダル）。承認後にログアウトしてホームへ。 */}
      {logoutConfirm && (
        <div className="modal-overlay" onClick={() => setLogoutConfirm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">
              <i className="fas fa-sign-out-alt" />
            </div>
            <h3 className="modal-title">ログアウトしますか？</h3>
            <p className="modal-text">
              ログアウトするとホームページに戻ります。再度ご利用にはログインが必要です。
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-outline" onClick={() => setLogoutConfirm(false)}>
                キャンセル
              </button>
              <button type="button" className="btn-navy" onClick={onLogout}>
                <i className="fas fa-sign-out-alt" /> ログアウト
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PB-036：受け渡しQRスキャナ（出品者が買い手のQRを読み取って決済） */}
      {scanning && (
        <BarcodeScanner
          formats={[BarcodeFormat.QR_CODE]}
          validate={(t) => decodePaymentQR(t) !== null}
          transform={(t) => t}
          title="買い手のQRを読み取る"
          hint="買い手が表示している受け渡しQRを枠内に映してください。読み取ると決済が実行されます。"
          onDetected={captureByQR}
          onClose={() => setScanning(false)}
        />
      )}
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
