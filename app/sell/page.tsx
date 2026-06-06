"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { conditionLabel, yen, CONDITION_OPTIONS } from "@/lib/labels";
import type { Condition } from "@/lib/types";

const condIcon: Record<Condition, string> = {
  "新品・未使用": "fa-star",
  "書き込みなし": "fa-book",
  "書き込み少し": "fa-pencil-alt",
  "汚れ・ダメージあり": "fa-exclamation-triangle",
};
const condDesc: Record<Condition, string> = {
  "新品・未使用": "書き込み・使用感なし",
  "書き込みなし": "きれいな状態",
  "書き込み少し": "メモ・マーカーあり",
  "汚れ・ダメージあり": "目立つ汚れ・折れあり",
};

export default function SellPage() {
  const { user, ready } = useAuth();
  const { showToast } = useToast();

  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [condition, setCondition] = useState<Condition | "">("");
  const [form, setForm] = useState({
    title: "",
    subject: "",
    author: "",
    isbn: "",
    year: "",
    desc: "",
    price: "",
    location: "",
  });

  if (!ready) return <main className="page-main" style={{ background: "var(--bg-gray)" }} />;

  if (!user) {
    return (
      <>
        <SellHeader />
        <main className="page-main" style={{ background: "var(--bg-gray)" }}>
          <div className="sell-container">
            <div className="form-card" style={{ textAlign: "center", padding: "48px 32px" }}>
              <div style={{ fontSize: "3rem", marginBottom: 16 }}>🔐</div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--navy)", marginBottom: 12 }}>
                ログインが必要です
              </h3>
              <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
                出品するにはログイン・ユーザー登録が必要です。
              </p>
              <Link href="/login" className="btn-navy">
                <i className="fas fa-sign-in-alt" /> ログイン / 登録
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    const remaining = 5 - images.length;
    if (remaining <= 0) {
      showToast("画像は最大5枚です", "warning");
      return;
    }
    Array.from(files)
      .slice(0, remaining)
      .forEach((file) => {
        if (!file.type.startsWith("image/")) return;
        const reader = new FileReader();
        reader.onload = (ev) => setImages((prev) => [...prev, ev.target?.result as string]);
        reader.readAsDataURL(file);
      });
  };

  const goStep = (n: number) => {
    if (n > 1 && (!form.title.trim() || !form.subject.trim())) {
      showToast("タイトルと授業名を入力してください", "error");
      return;
    }
    if (n > 2) {
      if (!condition) {
        showToast("教科書の状態を選択してください", "error");
        return;
      }
      if (!form.price || Number(form.price) < 0) {
        showToast("価格を入力してください", "error");
        return;
      }
      if (!form.location.trim()) {
        showToast("受け渡し場所を入力してください", "error");
        return;
      }
    }
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = () => {
    setDone(true);
    showToast("出品が完了しました！", "success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const previewCond = condition ? conditionLabel(condition) : null;

  return (
    <>
      <SellHeader />
      <main className="page-main" style={{ background: "var(--bg-gray)" }}>
        <div className="sell-container">
          {done ? (
            <div className="form-card" style={{ textAlign: "center", padding: "56px 32px" }}>
              <div style={{ fontSize: "2.2rem", marginBottom: 20, color: "var(--navy)" }}>
                <i className="fas fa-check-circle" />
              </div>
              <h2 style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--navy)", marginBottom: 12, border: "none", padding: 0 }}>
                出品が完了しました！
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.8, marginBottom: 32 }}>
                出品が正常に登録されました。
                <br />
                購入希望が届き次第、マイページに通知されます。
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <Link href="/listings" className="btn-navy">
                  <i className="fas fa-list" /> 一覧を見る
                </Link>
                <Link href="/mypage" className="btn-outline">
                  <i className="fas fa-user" /> マイページ
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* STEP INDICATOR */}
              <div className="step-indicator">
                <div className={`step ${step === 1 ? "active" : step > 1 ? "done" : ""}`.trim()}>
                  <div className="step-num">1</div>
                  <span>基本情報</span>
                </div>
                <div className={`step-line ${step > 1 ? "done" : ""}`.trim()} />
                <div className={`step ${step === 2 ? "active" : step > 2 ? "done" : ""}`.trim()}>
                  <div className="step-num">2</div>
                  <span>状態・価格</span>
                </div>
                <div className={`step-line ${step > 2 ? "done" : ""}`.trim()} />
                <div className={`step ${step === 3 ? "active" : ""}`.trim()}>
                  <div className="step-num">3</div>
                  <span>確認・出品</span>
                </div>
              </div>

              {/* STEP 1 */}
              {step === 1 && (
                <div>
                  <div className="form-card">
                    <h2>01 — 基本情報</h2>
                    <div className="form-group required">
                      <label>教科書タイトル</label>
                      <input type="text" placeholder="例：線形代数入門 第3版" value={form.title} onChange={set("title")} />
                    </div>
                    <div className="form-row">
                      <div className="form-group required">
                        <label>授業名</label>
                        <input type="text" placeholder="例：線形代数学" value={form.subject} onChange={set("subject")} />
                      </div>
                      <div className="form-group">
                        <label>著者名</label>
                        <input type="text" placeholder="例：田中一郎" value={form.author} onChange={set("author")} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>ISBN</label>
                        <input type="text" placeholder="978-4-XXXXXXXX" value={form.isbn} onChange={set("isbn")} />
                      </div>
                      <div className="form-group">
                        <label>出版年</label>
                        <input type="text" placeholder="例：2022" value={form.year} onChange={set("year")} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>コメント</label>
                      <textarea
                        rows={3}
                        placeholder="書き込みの程度・付属品の有無など自由に記載してください"
                        value={form.desc}
                        onChange={set("desc")}
                      />
                    </div>
                  </div>

                  <div className="form-card">
                    <h2>02 — 写真（任意）</h2>
                    <div className="img-upload-area">
                      <input type="file" accept="image/*" multiple onChange={(e) => onFiles(e.target.files)} />
                      <i className="fas fa-camera upload-icon" />
                      <p>
                        クリックまたはドラッグして画像を追加
                        <br />
                        <small style={{ fontSize: 11, opacity: 0.7 }}>JPG・PNG・WEBP 最大5枚</small>
                      </p>
                    </div>
                    {images.length > 0 && (
                      <div className="preview-grid">
                        {images.map((src, i) => (
                          <div className="preview-thumb" key={i}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={`preview ${i + 1}`} />
                            <button
                              type="button"
                              onClick={() => setImages((p) => p.filter((_, idx) => idx !== i))}
                              title="削除"
                            >
                              <i className="fas fa-times" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <button onClick={() => goStep(2)} className="btn-navy">
                      次へ <i className="fas fa-arrow-right" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2 */}
              {step === 2 && (
                <div>
                  <div className="form-card">
                    <h2>03 — 状態</h2>
                    <div className="condition-selector">
                      {CONDITION_OPTIONS.map((c) => (
                        <div
                          key={c}
                          className={`condition-opt ${condition === c ? "selected" : ""}`.trim()}
                          onClick={() => setCondition(c)}
                        >
                          <div style={{ fontSize: "1.4rem", marginBottom: 6 }}>
                            <i className={`fas ${condIcon[c]}`} style={{ color: "var(--navy)" }} />
                          </div>
                          <div>{c}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400, marginTop: 3 }}>
                            {condDesc[c]}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="form-card">
                    <h2>04 — 価格・場所</h2>
                    <div className="form-row">
                      <div className="form-group required">
                        <label>価格（円）</label>
                        <input type="number" min={0} max={99999} placeholder="例：800" value={form.price} onChange={set("price")} />
                        <p className="form-hint">手数料ゼロ。この金額がそのままあなたの利益です。</p>
                      </div>
                      <div className="form-group required">
                        <label>受け渡し希望場所</label>
                        <input type="text" placeholder="例：キャンパス正門前" value={form.location} onChange={set("location")} />
                      </div>
                    </div>
                    <div className="price-preview">
                      <div>
                        <div className="price-preview-label">出品価格</div>
                        <div className="price-preview-val">{form.price ? yen(Number(form.price)) : "¥ —"}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="price-note">
                          <i className="fas fa-check-circle" /> 手数料ゼロ
                        </div>
                        <div className="price-note">
                          <i className="fas fa-check-circle" /> 送料ゼロ
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <button onClick={() => goStep(1)} className="btn-outline">
                      <i className="fas fa-arrow-left" /> 戻る
                    </button>
                    <button onClick={() => goStep(3)} className="btn-navy">
                      確認へ <i className="fas fa-arrow-right" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3 */}
              {step === 3 && (
                <div>
                  <div className="preview-card-wrap">
                    <h2>05 — 出品内容の確認</h2>
                    <div className="live-preview">
                      <div className="preview-img-box">
                        {images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={images[0]} alt="プレビュー" />
                        ) : (
                          <i className="fas fa-book" style={{ color: "var(--navy)", opacity: 0.3 }} />
                        )}
                      </div>
                      <div className="preview-info">
                        <div className="preview-title">{form.title || "—"}</div>
                        <div className="preview-sub">{form.subject || "—"}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                          <div className="preview-price">{form.price ? yen(Number(form.price)) : "¥—"}</div>
                          {previewCond && (
                            <span className={`preview-cond card-condition ${previewCond.cls}`}>{previewCond.label}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="form-card">
                    <h2>06 — 出品者情報</h2>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, background: "var(--bg-light)", borderRadius: "var(--r)" }}>
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: "50%",
                          background: "var(--navy)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "white",
                          fontSize: "1.2rem",
                          fontWeight: 900,
                          flexShrink: 0,
                        }}
                      >
                        {(user.name || "?").charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>{user.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {`${user.faculty} ${user.grade}`.trim() || "GLOMAC学生"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <button onClick={submit} className="btn-navy btn-full" style={{ padding: 16, fontSize: 16 }}>
                      <i className="fas fa-plus-circle" /> 出品する
                    </button>
                    <button onClick={() => goStep(2)} className="btn-outline btn-full">
                      <i className="fas fa-arrow-left" /> 修正する
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}

function SellHeader() {
  return (
    <div className="page-header">
      <div className="page-header-inner">
        <div className="breadcrumb">
          <Link href="/">Home</Link>
          <i className="fas fa-chevron-right" style={{ fontSize: 9 }} />
          <span>出品する</span>
        </div>
        <h1>教科書を出品する</h1>
        <p>不要になった教科書を出品して、後輩・同期に繋げましょう</p>
      </div>
    </div>
  );
}
