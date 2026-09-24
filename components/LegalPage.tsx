import Link from "next/link";

// 規約系ページ（PB-048）の共通レイアウト。利用規約 / プライバシーポリシー / 特定商取引法表記で共有する。
// 本文は Notion 原稿で差し替える前提のため、公開前であることが分かる下書きバナーを上部に出す。
export default function LegalPage({
  title,
  updated,
  draft = true,
  mobileRows,
  children,
}: {
  title: string;
  updated: string;
  /** 本文が正式版に差し替わったら false にしてバナーを外す。 */
  draft?: boolean;
  /**
   * md 未満だけに出す全幅の行（`RowGroup`/`DataRow` 等）。`.container` の外に置いて
   * 画面幅いっぱいにする（マイページのメニュー画面と同じやり方）。表で表現している
   * 情報を持つページ（特商法）だけが渡す。
   */
  mobileRows?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main
      className="page-main min-h-[70vh] bg-bg-light pt-[var(--header-h)] pb-8 md:bg-bg-gray md:pt-[calc(var(--header-h)+32px)] md:pb-20"
    >
      {/* 見出しまで。下の余白は「最終更新日」の margin が持つ（コンテナに余白を足すと
          md 以上で本文が下にずれるため、ここでは 0 のままにする）。 */}
      <div className="container pt-6 md:pt-10" style={{ maxWidth: 820, paddingBottom: 0 }}>
        <nav style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          <Link href="/" style={{ color: "var(--text-muted)" }}>
            ホーム
          </Link>{" "}
          / {title}
        </nav>

        {draft && (
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "12px 16px",
              marginBottom: 24,
              borderRadius: 10,
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              color: "#9a3412",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            <i className="fas fa-triangle-exclamation" style={{ marginTop: 2 }} />
            <span>
              これは下書きです。公開前に運営が正式な条文（Notion 原稿）へ差し替えてください。差し替え後は{" "}
              <code>LegalPage</code> の <code>draft</code> を <code>false</code> にするとこの表示は消えます。
            </span>
          </div>
        )}

        <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--navy)", marginBottom: 6 }}>{title}</h1>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 28 }}>最終更新日：{updated}</p>
      </div>

      {mobileRows && <div className="md:hidden">{mobileRows}</div>}

      <div
        className={`container ${mobileRows ? "hidden md:block" : ""}`.trim()}
        style={{ maxWidth: 820, paddingTop: 0, paddingBottom: 64 }}
      >
        <article className="legal-body">{children}</article>
      </div>
    </main>
  );
}
