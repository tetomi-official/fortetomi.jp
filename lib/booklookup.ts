// ===================================================
// ISBN 書誌ルックアップ（PB-018 ①）
// OpenBD（主・日本書籍に強い）→ Google Books（副・洋書/補完）の2段構え。
// どちらもキー不要・CORS可なのでブラウザから直接呼べる（バックエンド不要）。
// ===================================================

export type BookMeta = {
  title?: string;
  author?: string;
  publisher?: string;
  publication_year?: string;
  /** 公式書影URL（参考表示用。出品写真とは別物）。 */
  cover_url?: string;
  source: "openbd" | "googlebooks";
};

/** ハイフン・空白などを除去し、ISBN を数字（と末尾X）だけに正規化。 */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, "").toUpperCase();
}

/** 文字列から最初の4桁（西暦）を抜き出す。 */
function extractYear(pubdate?: string | null): string | undefined {
  if (!pubdate) return undefined;
  const m = String(pubdate).match(/\d{4}/);
  return m ? m[0] : undefined;
}

async function lookupOpenBD(isbn: string): Promise<BookMeta | null> {
  const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(isbn)}`);
  if (!res.ok) return null;
  const data = await res.json();
  const entry = Array.isArray(data) ? data[0] : null;
  const summary = entry?.summary;
  if (!summary || !summary.title) return null;
  return {
    title: summary.title || undefined,
    author: summary.author || undefined,
    publisher: summary.publisher || undefined,
    publication_year: extractYear(summary.pubdate),
    cover_url: summary.cover || undefined,
    source: "openbd",
  };
}

async function lookupGoogleBooks(isbn: string): Promise<BookMeta | null> {
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  const info = data?.items?.[0]?.volumeInfo;
  if (!info || !info.title) return null;
  const cover = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
  return {
    title: info.title || undefined,
    author: Array.isArray(info.authors) ? info.authors.join(", ") : undefined,
    publisher: info.publisher || undefined,
    publication_year: extractYear(info.publishedDate),
    // Google の書影は http のことがあるため https に寄せる
    cover_url: cover ? cover.replace(/^http:/, "https:") : undefined,
    source: "googlebooks",
  };
}

/**
 * ISBN から書誌情報を取得。OpenBD を優先し、無ければ Google Books で補完。
 * 見つからなければ null。各APIの失敗は握りつぶして次へフォールバックする。
 */
export async function lookupBook(rawIsbn: string): Promise<BookMeta | null> {
  const isbn = normalizeIsbn(rawIsbn);
  if (isbn.length !== 10 && isbn.length !== 13) return null;

  try {
    const openbd = await lookupOpenBD(isbn);
    if (openbd) return openbd;
  } catch {
    /* フォールバックへ */
  }

  try {
    const google = await lookupGoogleBooks(isbn);
    if (google) return google;
  } catch {
    /* not found */
  }

  return null;
}
