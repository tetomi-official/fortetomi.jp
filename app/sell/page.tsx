"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useMemo, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { canSell } from "@/lib/prerelease";
import { useToast } from "@/components/Toast";
import { conditionLabel, yen, CONDITION_OPTIONS } from "@/lib/labels";
import { createListing, updateListing, uploadListingImages, fetchListingById } from "@/lib/listings";
import { lookupBook } from "@/lib/booklookup";
import { fetchCoursesByIsbn, facultiesFromCourses, type SyllabusCourse } from "@/lib/syllabus";
import BarcodeScanner from "@/components/BarcodeScanner";
import ConnectStatusBanner from "@/components/ConnectStatusBanner";
import { DataRow, ListRow, RowGroup, SectionLabel, SubBar } from "@/components/ListRow";
import { sellerNet } from "@/lib/constants";
import type { Condition } from "@/lib/types";
import { loginHref } from "@/lib/redirect";

const MIN_IMAGES = 2;
const MAX_IMAGES = 5;

// md 未満は案2「リスト型」の1枚もの、md 以上はこれまでの3ステップ。地の色もそれに合わせる。
const PAGE_MAIN =
  "page-main bg-bg-light pt-[var(--header-h)] pb-8 md:bg-bg-gray md:pt-[calc(var(--header-h)+32px)] md:pb-20";
// 入力の文字は 16px 以上（iOS が勝手に拡大するのを防ぐ）。
const MOBILE_INPUT =
  "h-13 min-w-0 flex-1 border-0 bg-transparent text-base text-navy outline-none placeholder:text-ink-faint";

/** 文字列配列の重複除去（空値は除外、順序維持）。 */
const uniqStrings = (arr: (string | null | undefined)[]): string[] => [
  ...new Set(arr.filter((s): s is string => !!s && s.trim() !== "")),
];

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

// ブラウザの戻る・進むで URL が変わったときに読み直す
function subscribeUrl(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}
function readEditId(): string | null {
  return new URLSearchParams(window.location.search).get("edit");
}

export default function SellPage() {
  const { user, ready, enrollmentActive } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [looking, setLooking] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  // 公式書影（参考表示。出品写真とは別物）。
  const [coverRef, setCoverRef] = useState<string | null>(null);
  // PB-058: ISBN一致した授業と、その使用学部。出品者が対象学部を選んで学部横断出品する。
  const [matchedCourses, setMatchedCourses] = useState<SyllabusCourse[]>([]);
  const [selectedFaculties, setSelectedFaculties] = useState<string[]>([]);
  // アップロード用に File を保持。プレビューは下の useEffect で生成。
  const [files, setFiles] = useState<File[]>([]);
  // 編集モード：?edit=ID。既存の画像は URL で保持し、追加分だけ File をアップロードする。
  // ?edit=ID は URL から直接読む。サーバーでの最初の表示では null（＝新規）として扱い、
  // ブラウザで読み直したときに切り替わる（表示の食い違いを起こさない読み方）。
  const editId = useSyncExternalStore(subscribeUrl, readEditId, () => null);
  // どの出品を読み込み終えたか。編集モードで、まだ読み終えていなければ「読み込み中」。
  const [loadedEditId, setLoadedEditId] = useState<string | null>(null);
  const editLoading = editId !== null && loadedEditId !== editId;
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [condition, setCondition] = useState<Condition | "">("");
  const [form, setForm] = useState({
    title: "",
    subject: "",
    author: "",
    publisher: "",
    isbn: "",
    year: "",
    desc: "",
    price: "",
    location: "",
  });

  // 選んだ写真の表示用 URL。写真が変わったら作り直し、古いものは後片付けする。
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  // 編集モード：?edit=ID があれば既存出品を読み込みフォームへプリフィルする。
  useEffect(() => {
    const id = editId;
    if (!id) return;
    fetchListingById(id).then((l) => {
      if (!l) {
        setLoadedEditId(id);
        showToast("編集対象の出品が見つかりませんでした", "error");
        return;
      }
      setForm({
        title: l.title,
        subject: l.subject,
        author: l.author ?? "",
        publisher: l.publisher ?? "",
        isbn: l.isbn ?? "",
        year: l.publication_year ?? "",
        desc: l.description ?? "",
        price: String(l.price),
        location: l.location,
      });
      setCondition(l.condition);
      setExistingImages(l.image_urls ?? []);
      setSelectedFaculties(l.faculties ?? []);
      setLoadedEditId(id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // md 未満はこの画面だけ「出品する」を下に固定する。その分の余白を本文の下に作らないと、
  // いちばん下のコメント欄がバーに隠れる。高さの出し入れは CSS 側（globals.css の
  // [data-bottom-bar]）に任せ、ここではバーを出している間だけ印を付ける。
  const bottomBarShown = !!user && enrollmentActive && !done && !editLoading;
  useEffect(() => {
    if (!bottomBarShown) return;
    document.documentElement.setAttribute("data-bottom-bar", "");
    return () => document.documentElement.removeAttribute("data-bottom-bar");
  }, [bottomBarShown]);

  if (!ready) return <main className={PAGE_MAIN} />;

  if (!user) {
    return (
      <>
        <SellHeader />
        <main className={PAGE_MAIN}>
          <div className="sell-container pt-4 md:pt-0">
            <div className="form-card" style={{ textAlign: "center", padding: "48px 32px" }}>
              <div style={{ fontSize: "3rem", marginBottom: 16 }}>🔐</div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--navy)", marginBottom: 12 }}>
                ログインが必要です
              </h3>
              <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
                出品するにはログイン・ユーザー登録が必要です。
              </p>
              <Link href={loginHref("/sell")} className="btn-navy">
                <i className="fas fa-sign-in-alt" /> ログイン / 登録
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  // ログイン済みでも在籍が失効していれば出品不可。再認証へ誘導する。
  if (!enrollmentActive) {
    return (
      <>
        <SellHeader />
        <main className={PAGE_MAIN}>
          <div className="sell-container pt-4 md:pt-0">
            <div className="form-card" style={{ textAlign: "center", padding: "48px 32px" }}>
              <div style={{ fontSize: "3rem", marginBottom: 16 }}>📧</div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--navy)", marginBottom: 12 }}>
                大学メールの再認証が必要です
              </h3>
              <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.9, marginBottom: 24 }}>
                新年度の在籍確認のため、大学メールでの再認証が必要です。
                <br />
                再認証が完了すると出品できるようになります。
              </p>
              <Link href="/reverify" className="btn-navy">
                <i className="fas fa-paper-plane" /> 再認証する
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    const remaining = MAX_IMAGES - existingImages.length - files.length;
    if (remaining <= 0) {
      showToast(`画像は最大${MAX_IMAGES}枚です`, "warning");
      return;
    }
    const picked = Array.from(list)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, remaining);
    if (picked.length) setFiles((prev) => [...prev, ...picked]);
  };

  // ISBN から書誌情報（書名・著者・出版社・出版年・公式書影）を自動入力する（PB-018 ①）。
  // isbnArg を渡すとその値で検索（バーコード読取からの即時呼び出し用。state 反映を待たない）。
  const lookupIsbn = async (isbnArg?: string) => {
    const isbn = (isbnArg ?? form.isbn).trim();
    if (!isbn) {
      showToast("ISBNを入力してください", "error");
      return;
    }
    setLooking(true);
    try {
      // 書誌情報（OpenBD/Google）とシラバス授業照合を並行取得。
      // 書誌が無くてもシラバスには載っていることがあるので、両者は独立に扱う。
      const [meta, courses] = await Promise.all([
        lookupBook(isbn).catch(() => null),
        fetchCoursesByIsbn(isbn).catch(() => [] as SyllabusCourse[]),
      ]);

      // PB-058: 使用授業と対象学部（出品者学部＋一致学部）を既定で全選択。
      setMatchedCourses(courses);
      const facultyOptions = uniqStrings([user.faculty, ...facultiesFromCourses(courses)]);
      setSelectedFaculties(facultyOptions);

      if (meta) {
        setForm((f) => ({
          ...f,
          title: meta.title ?? f.title,
          author: meta.author ?? f.author,
          publisher: meta.publisher ?? f.publisher,
          year: meta.publication_year ?? f.year,
          // 授業名が空なら、出品者学部の一致授業（無ければ先頭）で補完。
          subject: f.subject.trim() ? f.subject : preferredCourseName(courses, user.faculty) ?? f.subject,
        }));
        setCoverRef(meta.cover_url ?? null);
        showToast("書誌情報を自動入力しました。内容をご確認ください。", "success");
      } else {
        if (courses.length) {
          setForm((f) => ({
            ...f,
            subject: f.subject.trim() ? f.subject : preferredCourseName(courses, user.faculty) ?? f.subject,
          }));
        }
        showToast(
          courses.length
            ? "書誌情報は見つかりませんでしたが、シラバスの授業情報を取得しました。"
            : "該当する書籍が見つかりませんでした。手入力してください。",
          courses.length ? "success" : "warning",
        );
      }
    } catch {
      showToast("取得に失敗しました。時間をおいて再度お試しください。", "error");
    } finally {
      setLooking(false);
    }
  };

  // 授業名の自動補完用：出品者学部の授業を優先し、無ければ先頭の授業名を返す。
  const preferredCourseName = (courses: SyllabusCourse[], faculty?: string): string | undefined => {
    if (!courses.length) return undefined;
    const own = faculty ? courses.find((c) => c.faculty === faculty) : undefined;
    return (own ?? courses[0]).course_name;
  };

  // 対象学部チェックボックスのトグル（出品者学部は常に含める＝外せない）。
  const toggleFaculty = (faculty: string) => {
    if (user && faculty === user.faculty) return;
    setSelectedFaculties((prev) =>
      prev.includes(faculty) ? prev.filter((f) => f !== faculty) : [...prev, faculty],
    );
  };

  /**
   * 出品に必要な項目がそろっているか。足りなければ知らせる文を返す。
   * md 未満は 1 枚のフォームで最後にまとめて見るので、ここに集約している
   * （md 以上は下の goStep がステップごとに同じ内容を見る）。
   */
  const missingMessage = (): string | null => {
    if (!form.title.trim() || !form.subject.trim()) return "タイトルと授業名を入力してください";
    if (existingImages.length + files.length < MIN_IMAGES) {
      return `写真を${MIN_IMAGES}枚以上（表紙・裏表紙）追加してください`;
    }
    if (!condition) return "教科書の状態を選択してください";
    if (!form.price || Number(form.price) < 0) return "価格を入力してください";
    if (!form.location.trim()) return "受け渡し場所を入力してください";
    return null;
  };

  const goStep = (n: number) => {
    if (n > 1 && (!form.title.trim() || !form.subject.trim())) {
      showToast("タイトルと授業名を入力してください", "error");
      return;
    }
    if (n > 1 && existingImages.length + files.length < MIN_IMAGES) {
      showToast(`写真を${MIN_IMAGES}枚以上（表紙・裏表紙）追加してください`, "error");
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

  const submit = async () => {
    if (submitting) return;
    // プレリリース中（Phase < 2）は出品作成を封鎖。UI でも「次へ」を無効化しているが二重防御。
    if (!canSell) return;
    const missing = missingMessage();
    if (missing) {
      showToast(missing, "error");
      return;
    }
    if (!condition) return; // 上で弾いているが、型を絞るための念押し
    setSubmitting(true);
    try {
      // 追加された File だけアップロードし、残した既存画像URLと結合する。
      const uploaded = files.length ? await uploadListingImages(files) : [];
      const imageUrls = [...existingImages, ...uploaded];
      const payload = {
        title: form.title.trim(),
        subject: form.subject.trim(),
        author: form.author.trim(),
        publisher: form.publisher.trim(),
        isbn: form.isbn.trim(),
        publication_year: form.year.trim(),
        description: form.desc.trim(),
        condition,
        price: Number(form.price),
        location: form.location.trim(),
        image_urls: imageUrls,
        // PB-058: 出品者学部は必ず含める。ISBN一致で選んだ他学部を追加（学部横断出品）。
        faculties: uniqStrings([user.faculty, ...selectedFaculties]),
      };
      const { error } = editId
        ? await updateListing(editId, payload)
        : await createListing(payload, user.id);
      if (error) {
        showToast(
          editId ? "更新に失敗しました。時間をおいて再度お試しください。" : "出品に失敗しました。時間をおいて再度お試しください。",
          "error",
        );
        return;
      }
      setDone(true);
      showToast(editId ? "出品を更新しました！" : "出品が完了しました！", "success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      showToast(e instanceof Error ? e.message : editId ? "更新に失敗しました" : "出品に失敗しました", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const previewCond = condition ? conditionLabel(condition) : null;
  // PB-058: 対象学部の選択肢（出品者学部＋ISBN一致学部）。出品者学部は常に先頭・固定。
  const facultyOptions = uniqStrings([user.faculty, ...facultiesFromCourses(matchedCourses)]);

  return (
    <>
      <SellHeader editing={!!editId} />
      <main className={PAGE_MAIN}>
        <div className={`sell-container ${done || editLoading ? "pt-4 md:pt-0" : ""}`.trim()}>
          {done ? (
            <>
              <div className="form-card" style={{ textAlign: "center", padding: "56px 32px" }}>
                <div style={{ fontSize: "2.2rem", marginBottom: 20, color: "var(--navy)" }}>
                  <i className="fas fa-check-circle" />
                </div>
                <h2 style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--navy)", marginBottom: 12, border: "none", padding: 0 }}>
                  {editId ? "出品を更新しました！" : "出品が完了しました！"}
                </h2>
                <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.8, marginBottom: 32 }}>
                  {editId ? "変更内容が保存されました。" : "出品が正常に登録されました。"}
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
              <ConnectStatusBanner />
            </>
          ) : editLoading ? (
            <div className="form-card" style={{ textAlign: "center", padding: "56px 32px" }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: "2rem", color: "var(--navy)", opacity: 0.5 }} />
              <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 16 }}>出品内容を読み込み中…</p>
            </div>
          ) : (
            /* md 以上：これまでどおりの3ステップ。md 未満は下の1枚もの（案2）に差し替える。 */
            <div className="hidden md:block">
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
                        <label>出版社</label>
                        <input type="text" placeholder="例：〇〇出版" value={form.publisher} onChange={set("publisher")} />
                      </div>
                      <div className="form-group">
                        <label>カテゴリ</label>
                        <input type="text" value="教科書" disabled readOnly />
                        <p className="form-hint">現在は「教科書」のみ対応しています。</p>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>ISBN</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            type="text"
                            placeholder="978-4-XXXXXXXX"
                            value={form.isbn}
                            onChange={set("isbn")}
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            onClick={() => setScanOpen(true)}
                            className="btn-outline"
                            style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                            title="カメラでバーコードを読み取る"
                          >
                            <i className="fas fa-barcode" /> スキャン
                          </button>
                          <button
                            type="button"
                            onClick={() => lookupIsbn()}
                            disabled={looking}
                            className="btn-outline"
                            style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                          >
                            {looking ? (
                              <>
                                <i className="fas fa-spinner fa-spin" /> 取得中…
                              </>
                            ) : (
                              <>
                                <i className="fas fa-magic" /> 自動入力
                              </>
                            )}
                          </button>
                        </div>
                        <p className="form-hint">バーコードをスキャン、またはISBNを入力して書誌情報を自動入力します。</p>
                      </div>
                      <div className="form-group">
                        <label>出版年</label>
                        <input type="text" placeholder="例：2022" value={form.year} onChange={set("year")} />
                      </div>
                    </div>
                    {coverRef && (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "var(--bg-light)", borderRadius: "var(--r)", marginBottom: 4 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={coverRef} alt="公式書影" style={{ width: 44, height: 60, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                          参考：自動取得した公式書影です。
                          <br />
                          出品写真には実物の写真を別途アップロードしてください。
                        </div>
                      </div>
                    )}
                    {matchedCourses.length > 0 && (
                      <div className="syllabus-match-card">
                        <div className="syllabus-match-head">
                          <i className="fas fa-graduation-cap" />
                          <span>この教科書が使われる授業（シラバス照合）</span>
                        </div>
                        <p className="form-hint" style={{ marginTop: 0 }}>
                          出品する学部を選べます。選んだ学部の一覧・検索にこの出品が表示されます（学部横断出品）。
                          あなたの学部は常に含まれます。
                        </p>
                        <div className="faculty-check-row">
                          {facultyOptions.map((f) => {
                            const own = f === user.faculty;
                            const checked = own || selectedFaculties.includes(f);
                            const count = matchedCourses.filter((c) => c.faculty === f).length;
                            return (
                              <label key={f} className={`faculty-chip ${checked ? "on" : ""}`.trim()}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={own}
                                  onChange={() => toggleFaculty(f)}
                                />
                                <span>
                                  {f}
                                  {own && <em>（あなたの学部）</em>}
                                  {count > 0 && <b>{count}</b>}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <ul className="syllabus-course-list">
                          {matchedCourses.slice(0, 8).map((c) => (
                            <li key={c.id}>
                              <span className="course-name">{c.course_name}</span>
                              <span className="course-meta">
                                {[c.faculty, c.instructor, [c.term, c.day_period].filter(Boolean).join(" ")]
                                  .filter(Boolean)
                                  .join("・")}
                              </span>
                            </li>
                          ))}
                          {matchedCourses.length > 8 && (
                            <li className="course-more">ほか {matchedCourses.length - 8} 件</li>
                          )}
                        </ul>
                      </div>
                    )}
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
                    <h2>02 — 写真（必須・2枚以上）</h2>
                    <div className="img-upload-area">
                      <input type="file" accept="image/*" multiple onChange={(e) => onFiles(e.target.files)} />
                      <i className="fas fa-camera upload-icon" />
                      <p>
                        クリックまたはドラッグして画像を追加
                        <br />
                        <small style={{ fontSize: 11, opacity: 0.7 }}>
                          表紙・裏表紙を含め{MIN_IMAGES}枚以上（最大{MAX_IMAGES}枚）／ JPG・PNG・WEBP
                        </small>
                      </p>
                    </div>
                    {(existingImages.length > 0 || previews.length > 0) && (
                      <div className="preview-grid">
                        {existingImages.map((src, i) => (
                          <div className="preview-thumb" key={`exist-${i}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={`existing ${i + 1}`} />
                            <button
                              type="button"
                              onClick={() => setExistingImages((p) => p.filter((_, idx) => idx !== i))}
                              title="削除"
                            >
                              <i className="fas fa-times" />
                            </button>
                          </div>
                        ))}
                        {previews.map((src, i) => (
                          <div className="preview-thumb" key={`new-${i}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={`preview ${i + 1}`} />
                            <button
                              type="button"
                              onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}
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
                    {!canSell && (
                      <p className="form-hint" style={{ textAlign: "right", marginBottom: 8 }}>
                        現在プレリリース中のため、出品はまだご利用いただけません。まもなく公開します。
                      </p>
                    )}
                    <button
                      onClick={() => goStep(2)}
                      className="btn-navy"
                      disabled={!canSell}
                      title={!canSell ? "出品機能はまもなく公開します" : undefined}
                    >
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
                        <p className="form-hint">販売価格の10%が手数料として差し引かれます。</p>
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
                        <div className="price-preview-label">受け取り額（手数料10%差引）</div>
                        <div className="price-preview-val">
                          {form.price ? yen(sellerNet(Number(form.price))) : "¥ —"}
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
                        {(previews[0] ?? existingImages[0]) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={previews[0] ?? existingImages[0]} alt="プレビュー" />
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
                          {`${user.faculty} ${user.grade}`.trim()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <button onClick={submit} disabled={submitting} className="btn-navy btn-full" style={{ padding: 16, fontSize: 16 }}>
                      {submitting ? (
                        <>
                          <i className="fas fa-spinner fa-spin" /> {editId ? "更新中…" : "出品中…"}
                        </>
                      ) : (
                        <>
                          <i className={`fas ${editId ? "fa-save" : "fa-plus-circle"}`} /> {editId ? "更新する" : "出品する"}
                        </>
                      )}
                    </button>
                    <button onClick={() => goStep(2)} disabled={submitting} className="btn-outline btn-full">
                      <i className="fas fa-arrow-left" /> 修正する
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===== md 未満：案2「リスト型」の1枚もの =====
            見た目の正解は docs/mockups/mobile/V2Sell.dc.html。3ステップに分けず、
            写真 → バーコード → 基本情報 → 状態 → 価格・受け渡し → コメント の順に
            並べ、「出品する」だけを下に固定する。中身（state・保存処理）は上と同じ。
            上の3ステップより後ろに置いているのは、自動テストが文言でボタンを探すとき、
            PC 幅で見えている方（＝上）が先に見つかるようにするため。 */}
        {!done && !editLoading && (
          <div className="md:hidden" data-sell-form="mobile">
            <SubBar
              title={editId ? "出品を編集する" : "教科書を出品する"}
              onBack={() => router.back()}
            />

            {/* 写真 */}
            <SectionLabel>写真（{MIN_IMAGES}枚以上・表紙と裏表紙）</SectionLabel>
            <RowGroup>
              <div className="flex flex-wrap gap-2 p-4">
                {existingImages.map((src, i) => (
                  <PhotoThumb
                    key={`exist-${i}`}
                    src={src}
                    alt={`登録済みの写真${i + 1}`}
                    onRemove={() => setExistingImages((p) => p.filter((_, idx) => idx !== i))}
                  />
                ))}
                {previews.map((src, i) => (
                  <PhotoThumb
                    key={`new-${i}`}
                    src={src}
                    alt={`追加した写真${i + 1}`}
                    onRemove={() => setFiles((p) => p.filter((_, idx) => idx !== i))}
                  />
                ))}
                {existingImages.length + files.length < MAX_IMAGES && (
                  <label className="flex h-28 w-22 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg bg-bg-light text-xs text-navy">
                    <i className="fas fa-plus text-xl" aria-hidden="true" />
                    追加
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      onChange={(e) => onFiles(e.target.files)}
                    />
                  </label>
                )}
              </div>
            </RowGroup>
            <p className="px-4 pt-2 text-xs leading-relaxed text-ink-sub">
              表紙・裏表紙を含め{MIN_IMAGES}枚以上（最大{MAX_IMAGES}枚）／ JPG・PNG・WEBP
            </p>

            {/* バーコードで自動入力 */}
            <SectionLabel>バーコードで自動入力</SectionLabel>
            <RowGroup>
              <ListRow
                icon="fa-camera"
                label="カメラでバーコードを読み取る"
                onClick={() => setScanOpen(true)}
              />
              <FieldRow
                label="ISBN"
                action={
                  <button
                    type="button"
                    onClick={() => lookupIsbn()}
                    disabled={looking}
                    className="flex h-11 shrink-0 items-center px-1 text-[13px] font-bold text-navy disabled:text-ink-faint"
                  >
                    {looking ? "取得中…" : "自動入力"}
                  </button>
                }
              >
                <input
                  name="isbn"
                  type="text"
                  placeholder="978-"
                  value={form.isbn}
                  onChange={set("isbn")}
                  className={MOBILE_INPUT}
                />
              </FieldRow>
            </RowGroup>
            <p className="px-4 pt-2 text-xs leading-relaxed text-ink-sub">
              バーコードをスキャン、またはISBNを入力して書誌情報を自動入力します。
            </p>

            {/* 基本情報 */}
            <SectionLabel>基本情報</SectionLabel>
            <RowGroup>
              <FieldRow label="タイトル">
                <input
                  name="title"
                  type="text"
                  placeholder="例：線形代数入門 第3版"
                  value={form.title}
                  onChange={set("title")}
                  className={MOBILE_INPUT}
                />
              </FieldRow>
              <FieldRow label="授業名">
                <input
                  name="subject"
                  type="text"
                  placeholder="例：線形代数学"
                  value={form.subject}
                  onChange={set("subject")}
                  className={MOBILE_INPUT}
                />
              </FieldRow>
              <FieldRow label="著者名">
                <input
                  name="author"
                  type="text"
                  placeholder="例：田中一郎"
                  value={form.author}
                  onChange={set("author")}
                  className={MOBILE_INPUT}
                />
              </FieldRow>
              <FieldRow label="出版社">
                <input
                  name="publisher"
                  type="text"
                  placeholder="例：〇〇出版"
                  value={form.publisher}
                  onChange={set("publisher")}
                  className={MOBILE_INPUT}
                />
              </FieldRow>
              <FieldRow label="出版年">
                <input
                  name="year"
                  type="text"
                  placeholder="例：2022"
                  value={form.year}
                  onChange={set("year")}
                  className={MOBILE_INPUT}
                />
              </FieldRow>
              <DataRow label="カテゴリ" value="教科書" />
            </RowGroup>

            {coverRef && (
              <div className="mt-3 flex items-center gap-3 border-y border-line-light bg-white px-4 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverRef} alt="公式書影" className="h-15 w-11 shrink-0 rounded-xs object-cover" />
                <p className="text-xs leading-relaxed text-ink-sub">
                  参考：自動取得した公式書影です。出品写真には実物の写真を別途アップロードしてください。
                </p>
              </div>
            )}

            {/* PB-058: ISBN が一致した授業と、出品する学部（学部横断出品） */}
            {matchedCourses.length > 0 && (
              <>
                <SectionLabel>この教科書が使われる授業（シラバス照合）</SectionLabel>
                <RowGroup>
                  {facultyOptions.map((f) => {
                    const own = f === user.faculty;
                    const checked = own || selectedFaculties.includes(f);
                    const count = matchedCourses.filter((c) => c.faculty === f).length;
                    return (
                      <label
                        key={f}
                        className="flex min-h-12 items-center gap-3 border-b border-line-light bg-white px-4 py-2 text-sm text-navy"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={own}
                          onChange={() => toggleFaculty(f)}
                          className="h-5 w-5 shrink-0 accent-navy"
                        />
                        <span className="min-w-0 flex-1 font-bold">
                          {f}
                          {own && <span className="ml-1 text-xs font-normal text-ink-sub">（あなたの学部）</span>}
                        </span>
                        {count > 0 && <span className="shrink-0 text-xs text-ink-sub">{count}件</span>}
                      </label>
                    );
                  })}
                </RowGroup>
                <p className="px-4 pt-2 text-xs leading-relaxed text-ink-sub">
                  選んだ学部の一覧・検索にこの出品が表示されます。あなたの学部は常に含まれます。
                </p>
                <div className="mt-3 border-y border-line-light bg-white px-4 py-3">
                  <ul className="flex flex-col gap-2">
                    {matchedCourses.slice(0, 8).map((c) => (
                      <li key={c.id} className="text-[13px] leading-snug">
                        <span className="font-bold text-navy">{c.course_name}</span>
                        <span className="block text-xs text-ink-sub">
                          {[c.faculty, c.instructor, [c.term, c.day_period].filter(Boolean).join(" ")]
                            .filter(Boolean)
                            .join("・")}
                        </span>
                      </li>
                    ))}
                    {matchedCourses.length > 8 && (
                      <li className="text-xs text-ink-sub">ほか {matchedCourses.length - 8} 件</li>
                    )}
                  </ul>
                </div>
              </>
            )}

            {/* 状態 */}
            <SectionLabel>状態</SectionLabel>
            <RowGroup>
              {CONDITION_OPTIONS.map((c) => (
                <label
                  key={c}
                  className="flex min-h-12 items-center gap-3 border-b border-line-light bg-white px-4 py-2 text-sm text-navy"
                >
                  <input
                    type="radio"
                    name="condition"
                    value={c}
                    checked={condition === c}
                    onChange={() => setCondition(c)}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      condition === c ? "border-navy" : "border-line"
                    }`}
                    aria-hidden="true"
                  >
                    {condition === c && <span className="h-2.5 w-2.5 rounded-full bg-navy" />}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-bold">{c}</span>
                    <span className="text-xs text-ink-sub">{condDesc[c]}</span>
                  </span>
                </label>
              ))}
            </RowGroup>

            {/* 価格・受け渡し */}
            <SectionLabel>価格・受け渡し</SectionLabel>
            <RowGroup>
              <FieldRow label="価格（円）">
                <input
                  name="price"
                  type="number"
                  min={0}
                  max={99999}
                  inputMode="numeric"
                  placeholder="例：800"
                  value={form.price}
                  onChange={set("price")}
                  className={MOBILE_INPUT}
                />
              </FieldRow>
              <FieldRow label="受け渡し場所">
                <input
                  name="location"
                  type="text"
                  placeholder="例：キャンパス正門前"
                  value={form.location}
                  onChange={set("location")}
                  className={MOBILE_INPUT}
                />
              </FieldRow>
            </RowGroup>
            <p className="px-4 pt-2 text-xs leading-relaxed text-ink-sub">
              販売価格の10%が手数料として差し引かれます。
            </p>
            <RowGroup className="mt-3">
              <DataRow label="出品価格" value={form.price ? yen(Number(form.price)) : "¥ —"} />
              <DataRow
                label="受け取り額（手数料10%差引）"
                value={form.price ? yen(sellerNet(Number(form.price))) : "¥ —"}
              />
            </RowGroup>

            {/* コメント */}
            <SectionLabel>コメント</SectionLabel>
            <RowGroup>
              <textarea
                name="desc"
                aria-label="コメント"
                rows={4}
                placeholder="書き込みの程度・付属品の有無など"
                value={form.desc}
                onChange={set("desc")}
                className="block min-h-24 w-full resize-none border-0 bg-white px-4 py-3 text-base text-navy outline-none placeholder:text-ink-faint"
              />
            </RowGroup>

            {!canSell && (
              <p className="px-4 pt-4 text-xs leading-relaxed text-ink-sub">
                現在プレリリース中のため、出品はまだご利用いただけません。まもなく公開します。
              </p>
            )}

            {/* 下部固定の「出品する」。商品詳細の購入バーと同じ作りで、下タブバーの上に置く。
                本文の下の余白は globals.css の [data-bottom-bar]（76px＝このバーの高さ）が足す。 */}
            <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h)] z-[390] flex h-19 items-center border-t border-line-light bg-white px-4">
              <button
                type="button"
                onClick={submit}
                disabled={submitting || !canSell}
                className="flex h-13 w-full items-center justify-center gap-2 rounded-[10px] bg-navy text-base font-bold text-white disabled:bg-line"
              >
                {submitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin" /> {editId ? "更新中…" : "出品中…"}
                  </>
                ) : !canSell ? (
                  <>
                    <i className="fas fa-lock" /> 準備中です
                  </>
                ) : editId ? (
                  "更新する"
                ) : (
                  "出品する"
                )}
              </button>
            </div>
          </div>
        )}
      </main>

      {scanOpen && (
        <BarcodeScanner
          onClose={() => setScanOpen(false)}
          onDetected={(isbn) => {
            setScanOpen(false);
            setForm((f) => ({ ...f, isbn }));
            void lookupIsbn(isbn);
          }}
        />
      )}
    </>
  );
}

/**
 * md 未満の入力行（左ラベル 104px・右入力）。`action` は行の右端に置く小さな操作
 * （ISBN の「自動入力」など）。区切り線は行が持ち、まとまりの最終行ぶんは RowGroup が消す。
 */
function FieldRow({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex h-14 items-center gap-3 border-b border-line-light bg-white px-4 text-[15px] text-navy">
      <span className="w-26 shrink-0 font-bold">{label}</span>
      {children}
      {action}
    </label>
  );
}

/** md 未満の写真1枚（88×112px）。右上の × で取り消す。 */
function PhotoThumb({ src, alt, onRemove }: { src: string; alt: string; onRemove: () => void }) {
  return (
    <div className="relative h-28 w-22 overflow-hidden rounded-lg bg-line-light" data-photo-thumb>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${alt}を削除`}
        className="absolute top-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-navy/70 text-white"
      >
        <i className="fas fa-times" aria-hidden="true" />
      </button>
    </div>
  );
}

function SellHeader({ editing = false }: { editing?: boolean }) {
  return (
    // 紺のページヘッダーは md 以上だけ。md 未満はヘッダー直下のサブバーが画面名を出す（案2）。
    <div className="page-header hidden md:block">
      <div className="page-header-inner">
        <div className="breadcrumb">
          <Link href="/">Home</Link>
          <i className="fas fa-chevron-right" style={{ fontSize: 9 }} />
          <span>{editing ? "出品を編集する" : "出品する"}</span>
        </div>
        <h1>{editing ? "出品内容を編集する" : "教科書を出品する"}</h1>
        <p>
          {editing
            ? "登録済みの内容を編集できます。変更後「更新する」を押してください。"
            : "不要になった教科書を出品して、後輩・同期に繋げましょう"}
        </p>
      </div>
    </div>
  );
}
