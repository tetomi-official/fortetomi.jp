"use client";

import { useRef, useState } from "react";
import { answerQuestion, FAQS, SUPPORT_CONTACT, type Faq } from "@/lib/support";

// 運営サポート（PB-042）。「基本よくある質問はAI対応」。
// 自己完結のFAQアシスタント（lib/support.ts）。チャット風に質問へ回答し、
// 解決しない場合は有人窓口（メール）へ案内する。下部によくある質問一覧も常設。

type ChatItem =
  | { role: "user"; text: string }
  | { role: "bot"; text: string; related: Faq[] };

const GREETING: ChatItem = {
  role: "bot",
  text: "こんにちは！フォルテとみ運営サポートです。出品・購入・受け渡し・在籍確認など、お困りごとを入力してください。よくある質問は下にもまとめています。",
  related: [],
};

export default function SupportPanel() {
  const [chat, setChat] = useState<ChatItem[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    const ans = answerQuestion(q);
    setChat((prev) => [
      ...prev,
      { role: "user", text: q },
      { role: "bot", text: ans.text, related: ans.related },
    ]);
    setDraft("");
    // 回答描画後に末尾へスクロール。
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }),
    );
  };

  return (
    <div className="panel-card">
      <div className="panel-header">
        <h3>
          <i className="fas fa-headset" style={{ marginRight: 8 }} />
          運営サポート
        </h3>
      </div>
      <div className="panel-body">
        <div className="support-chat" ref={scrollRef}>
          {chat.map((item, i) =>
            item.role === "user" ? (
              <div key={i} className="msg-bubble-row mine">
                <div className="msg-bubble mine">{item.text}</div>
              </div>
            ) : (
              <div key={i} className="support-bot-row">
                <div className="support-bot-avatar">
                  <i className="fas fa-robot" />
                </div>
                <div className="support-bot-bubble">
                  <div>{item.text}</div>
                  {item.related.length > 0 && (
                    <div className="support-related">
                      {item.related.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className="support-chip"
                          onClick={() => ask(f.q)}
                        >
                          {f.q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
        </div>

        <form
          className="msg-input-bar"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <input
            type="text"
            placeholder="質問を入力…（例：出品のやり方）"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="btn-navy" disabled={!draft.trim()}>
            <i className="fas fa-paper-plane" /> 質問する
          </button>
        </form>

        <div className="support-faq">
          <div className="support-faq-title">よくある質問</div>
          {FAQS.map((f) => (
            <details key={f.id} className="support-faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
          <p className="support-contact">
            解決しない場合は{" "}
            <a href={`mailto:${SUPPORT_CONTACT}`}>{SUPPORT_CONTACT}</a> までお問い合わせください。
          </p>
        </div>
      </div>
    </div>
  );
}
