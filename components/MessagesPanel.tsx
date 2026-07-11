"use client";

import { useEffect, useRef, useState } from "react";
import { fetchMessages, sendMessage, subscribeMessages } from "@/lib/messages";
import { reservationBadgeClass } from "@/lib/labels";
import type { Message, Reservation, User } from "@/lib/types";

// 取引メッセージ（PB-041）。1 予約 = 1 スレッド。
// threads には自分が買い手 / 出品者として関わる予約を渡す（キャンセル済みは除外して渡す想定）。

type Thread = {
  reservation: Reservation;
  /** 相手の表示名。自分が買い手なら出品者、出品者なら買い手。 */
  counterpart: string;
  /** 自分から見た役割。表示の補助に使う。 */
  role: "buyer" | "seller";
};

function buildThreads(reservations: Reservation[], userId: string): Thread[] {
  return reservations.map((r) => {
    const isBuyer = r.buyer_id === userId;
    return {
      reservation: r,
      counterpart: isBuyer ? r.seller_name : r.buyer_name,
      role: isBuyer ? "buyer" : "seller",
    };
  });
}

export default function MessagesPanel({
  user,
  threads: reservations,
}: {
  user: User;
  threads: Reservation[];
}) {
  const threads = buildThreads(reservations, user.id);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = threads.find((t) => t.reservation.id === activeId) ?? null;

  if (!active) {
    return (
      <div className="panel-card">
        <div className="panel-header">
          <h3>メッセージ</h3>
        </div>
        <div className="panel-body">
          {threads.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <span style={{ fontSize: "4rem" }}>💬</span>
              </div>
              <h3>進行中のメッセージはありません</h3>
              <div style={{ marginTop: 8 }}>
                <p>購入希望のやり取りが始まると、ここに相手とのチャットが表示されます。</p>
              </div>
            </div>
          ) : (
            <div className="msg-thread-list">
              {threads.map((t) => (
                <button
                  key={t.reservation.id}
                  type="button"
                  className="msg-thread-item"
                  onClick={() => setActiveId(t.reservation.id)}
                >
                  <div className="msg-thread-avatar">{(t.counterpart || "?").charAt(0)}</div>
                  <div className="msg-thread-info">
                    <div className="msg-thread-top">
                      <span className="msg-thread-name">{t.counterpart}</span>
                      <span className={`badge ${reservationBadgeClass(t.reservation.status)}`}>
                        {t.reservation.status}
                      </span>
                    </div>
                    <div className="msg-thread-sub">
                      <i className="fas fa-book" /> {t.reservation.listing_title}
                      <span className="msg-thread-role">
                        {t.role === "buyer" ? "購入希望" : "受け取った希望"}
                      </span>
                    </div>
                  </div>
                  <i className="fas fa-chevron-right msg-thread-chev" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return <Conversation user={user} thread={active} onBack={() => setActiveId(null)} />;
}

function Conversation({
  user,
  thread,
  onBack,
}: {
  user: User;
  thread: Thread;
  onBack: () => void;
}) {
  const reservationId = thread.reservation.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 初回ロード＋リアルタイム購読。相手の新着が即座に反映される。
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchMessages(reservationId).then((data) => {
      if (!active) return;
      setMessages(data);
      setLoading(false);
    });
    const unsubscribe = subscribeMessages(reservationId, (msg) => {
      // 自分の送信は楽観更新で既に追加済み。重複を避ける。
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [reservationId]);

  // 末尾へ自動スクロール。
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const { error, message } = await sendMessage(reservationId, user.id, body);
    setSending(false);
    if (error || !message) return; // 失敗時は入力を残す
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    setDraft("");
  };

  return (
    <div className="panel-card">
      <div className="panel-header msg-conv-header">
        <button type="button" className="msg-back" onClick={onBack} aria-label="戻る">
          <i className="fas fa-arrow-left" />
        </button>
        <div className="msg-conv-title">
          <h3>{thread.counterpart}</h3>
          <span className="msg-conv-sub">{thread.reservation.listing_title}</span>
        </div>
        <span className={`badge ${reservationBadgeClass(thread.reservation.status)}`}>
          {thread.reservation.status}
        </span>
      </div>
      <div className="msg-conv-body" ref={scrollRef}>
        {loading ? (
          <div className="msg-empty">読み込み中…</div>
        ) : messages.length === 0 ? (
          <div className="msg-empty">
            まだメッセージはありません。受け渡しの相談を始めましょう。
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === user.id;
            return (
              <div key={m.id} className={`msg-bubble-row${mine ? " mine" : ""}`}>
                <div className={`msg-bubble${mine ? " mine" : ""}`}>{m.body}</div>
                <div className="msg-time">{formatTime(m.created_at)}</div>
              </div>
            );
          })
        )}
      </div>
      <form className="msg-input-bar" onSubmit={submit}>
        <input
          type="text"
          placeholder="メッセージを入力…"
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn-navy" disabled={sending || !draft.trim()}>
          <i className="fas fa-paper-plane" /> 送信
        </button>
      </form>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}
