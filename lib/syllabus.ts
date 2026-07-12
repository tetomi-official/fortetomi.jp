import { createClient } from "@/lib/supabase/client";
import { normalizeIsbn } from "@/lib/booklookup";

// ===================================================
// シラバス照合（PB-058 Phase 1）
// ISBN から「その教科書が使われている授業」を引く。授業は syllabus_courses、
// ISBN→授業の逆引きは syllabus_textbooks（isbn13 にインデックス）。
// スクレイパー（scripts/scrape-syllabus.mjs）が投入したデータを読むだけ。
// ===================================================

/** 詳細ページ・出品ページで表示する授業の最小情報。 */
export type SyllabusCourse = {
  id: number;
  course_name: string;
  faculty: string | null;
  instructor: string | null;
  term: string | null;
  day_period: string | null;
  credits: number | null;
  year_level: string | null;
  source_url: string | null;
};

/** ISBN-10 を ISBN-13（978 プレフィックス）へ変換。scrape-syllabus.mjs と同ロジック。 */
function isbn10to13(d10: string): string {
  const core = "978" + d10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 ? 3 : 1);
  return core + ((10 - (sum % 10)) % 10);
}

/**
 * アプリ側の生 ISBN（ハイフン付き・10桁/13桁混在）を、syllabus_textbooks.isbn13 に
 * 合わせた 13 桁へ正規化する。判定不能なら null。
 */
export function toIsbn13(rawIsbn: string): string | null {
  const n = normalizeIsbn(rawIsbn); // 数字（と X）だけに正規化
  if (n.length === 13 && /^\d{13}$/.test(n)) return n;
  if (n.length === 10 && /^\d{9}[\dX]$/.test(n)) return isbn10to13(n);
  return null;
}

const COURSE_COLS =
  "id, course_name, faculty, instructor, term, day_period, credits, year_level, source_url";

/**
 * ISBN からその教科書が使われている授業を取得（学部の絞り込みはしない）。
 * 使用学部は返り値の `faculty` を uniq して算出する。
 * ISBN が不正・一致なしなら空配列。
 */
export async function fetchCoursesByIsbn(rawIsbn: string): Promise<SyllabusCourse[]> {
  const isbn13 = toIsbn13(rawIsbn);
  if (!isbn13) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("syllabus_textbooks")
    .select(`syllabus_courses!inner(${COURSE_COLS})`)
    .eq("isbn13", isbn13);
  if (error) {
    console.error("fetchCoursesByIsbn failed:", error.message);
    return [];
  }

  // syllabus_courses を取り出し、course id で重複排除（同一科目に複数ISBN行がある場合に備えて）。
  // course_id→syllabus_courses は多対一なので実体は単一オブジェクトだが、supabase-js の
  // 型推論は埋め込みを配列にするため、両対応してから正規化する。
  type Row = { syllabus_courses: SyllabusCourse | SyllabusCourse[] | null };
  const rows = (data ?? []) as unknown as Row[];
  const byId = new Map<number, SyllabusCourse>();
  for (const row of rows) {
    const c = Array.isArray(row.syllabus_courses) ? row.syllabus_courses[0] : row.syllabus_courses;
    if (c && !byId.has(c.id)) byId.set(c.id, c);
  }
  return [...byId.values()];
}

/** 授業リストから使用学部（重複除去）を返す。null/空は除外。 */
export function facultiesFromCourses(courses: SyllabusCourse[]): string[] {
  const set = new Set<string>();
  for (const c of courses) if (c.faculty) set.add(c.faculty);
  return [...set];
}
