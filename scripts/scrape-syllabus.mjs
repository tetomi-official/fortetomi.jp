// ===================================================
// TETOMI: 中央大学シラバスDBのスクレイピング（PB-056）
//
//   node scripts/scrape-syllabus.mjs [options]
//   npm run scrape:syllabus -- --from 1090 --to 1096 --dry-run
//
// 詳細ページ /syllabus/detail/?id=N を数値ID巡回で取得し、Supabase の
//   public.syllabus_courses   … 1科目1行（id を自然キーに upsert）
//   public.syllabus_textbooks … 科目×ISBN の逆引き（058 の照合用）
// に保存する。存在しないIDは HTTP 404 が返るのでスキップ。
//
// ページは jQuery のみのサーバレンダリング（SPAではない）ため、依存追加なしの
// 軽量な正規表現パーサで抽出する。教科書欄は自由記述で書式がバラバラなので、
// 確実に取れる ISBN（チェックサム検証）だけを構造化し、原文は references_raw に残す。
//
// 認証: service role（RLS バイパス）。.env.local から読込:
//   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//
// 冪等: upsert（onConflict: id）＋ 科目ごとに syllabus_textbooks を作り直すので、
//       途中で止めて再実行（--from で続き）しても安全。
//
// オプション:
//   --from N        開始ID（既定 1）
//   --to N          終了ID（既定 15000。実測の最大IDは ~14700）
//   --limit N       取得（200が返った）件数の上限。小範囲テスト用。
//   --delay MS      各リクエスト間の待機ms（既定 300。礼儀のため）
//   --dry-run       DBに書き込まず、抽出結果と統計のみ表示。
//   --verbose       200が返るたびに1行ログ。
// ===================================================

import { createClient } from "@supabase/supabase-js";

// ---- 引数 -------------------------------------------------------------------
function argVal(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const FROM = parseInt(argVal("--from", "1"), 10);
const TO = parseInt(argVal("--to", "15000"), 10);
const LIMIT = argVal("--limit", null) ? parseInt(argVal("--limit"), 10) : Infinity;
const DELAY = parseInt(argVal("--delay", "300"), 10);
const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");
const UA = "Mozilla/5.0 (compatible; TETOMI-syllabus-indexer/1.0; +https://tetomi.jp)";
const BASE = "https://syllabus.chuo-u.ac.jp/syllabus/detail/?id=";
const BATCH = 50; // upsert バッチ件数

// ---- Supabase（dry-run 時は不要） -------------------------------------------
let admin = null;
if (!DRY_RUN) {
  process.loadEnvFile(new URL("../.env.local", import.meta.url));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[scrape] NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です（.env.local）。");
    process.exit(1);
  }
  admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- HTML ヘルパ ------------------------------------------------------------
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function htmlToText(html) {
  if (html == null) return "";
  let s = String(html).replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s;
}
const oneLine = (s) => htmlToText(s).replace(/\s+/g, " ").trim();

// ---- 概要テーブル（<table summary="講義詳細..."> の 見出し行→値行） ----------
function parseSummaryTable(html) {
  const tm = html.match(/<table[^>]*summary="講義詳細[^"]*"[^>]*>([\s\S]*?)<\/table>/);
  if (!tm) return null;
  const t = tm[1];
  const ths = [...t.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => oneLine(m[1]));
  // 最初に <td> を含む行が値行（先頭行は <th> の見出し行）
  const trs = [...t.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  const valueRow = trs.find((tr) => /<td/.test(tr));
  if (!valueRow) return null;
  const tds = [...valueRow.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => oneLine(m[1]));
  const rec = {};
  ths.forEach((h, i) => { if (h) rec[h] = tds[i] ?? ""; });
  return rec;
}

// ---- 詳細項目（<div class="item"><h4>ラベル</h3><p>値</p></div>） ------------
// h4 の閉じタグが </h3> のことがある（サイトのHTML崩れ）ため h[1-6] を許容。
function parseItems(html) {
  const items = {};
  const parts = html.split(/<div class="item">/).slice(1);
  for (const part of parts) {
    const hm = part.match(/<h[1-6]>([\s\S]*?)<\/h[1-6]>/);
    if (!hm) continue;
    const label = oneLine(hm[1]);
    if (!label) continue;
    let rest = part.slice(hm.index + hm[0].length);
    const cut = rest.indexOf("</div>"); // item 内は <p>/<table> のみで <div> ネストは無い
    if (cut >= 0) rest = rest.slice(0, cut);
    items[label] = htmlToText(rest);
  }
  return items;
}

// ---- ISBN 抽出（チェックサム検証で誤検出を排除） ----------------------------
function isbn13Ok(d) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (+d[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === +d[12];
}
function isbn10Ok(d) {
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (d[i] === "X" ? 10 : +d[i]) * (10 - i);
  return sum % 11 === 0;
}
function isbn10to13(d10) {
  const core = "978" + d10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (+core[i]) * (i % 2 ? 3 : 1);
  return core + ((10 - (sum % 10)) % 10);
}
function extractIsbns(text) {
  if (!text) return [];
  const found = new Map(); // isbn13 -> 原文表記
  // ISBN-13: 978/979 に続けて（区切り文字任意で）10桁。checksum で確定。
  const re13 = /97[89](?:[\s\-–—]?\d){10}/g;
  let m;
  while ((m = re13.exec(text))) {
    const raw = m[0].trim();
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits.length === 13 && isbn13Ok(digits) && !found.has(digits)) found.set(digits, raw);
  }
  // ISBN-10: 誤検出を避けるため "ISBN" ラベルに続くものだけ拾う。
  const re10 = /ISBN[-:：\s]*((?:\d[\s\-–—]?){9}[\dxX])/gi;
  while ((m = re10.exec(text))) {
    const digits = m[1].replace(/[^0-9xX]/g, "").toUpperCase();
    if (digits.length === 10 && isbn10Ok(digits)) {
      const i13 = isbn10to13(digits);
      if (!found.has(i13)) found.set(i13, m[1].trim());
    }
  }
  return [...found.entries()].map(([isbn13, isbn_raw]) => ({ isbn13, isbn_raw }));
}

// ---- 学部ラベルをアプリの正規名（lib/constants.ts の FACULTIES）へ寄せる ------------
// 理工はシラバス上「基幹理工学部／社会理工学部／先進理工学部／理工学部」の複合ラベルで
// 入るため、アプリの profiles.faculty（"理工学部"）と一致するよう正規化する。他7学部は一致済み。
function normalizeFaculty(faculty) {
  if (!faculty) return faculty;
  const f = faculty.trim();
  if (f.includes("理工学部")) return "理工学部";
  return f;
}

// ---- 学部（学部課程）のみ対象。大学院・研究科・専門職大学院は保存しない ------------
// 中央大の学部はすべて「〜学部」で終わる（法/経済/商/文/総合政策/国際経営/国際情報/理工）。
// 大学院は「〜研究科…課程」「法務研究科」「ビジネススクール」等で、学部名では終わらない。
function isUndergraduate(faculty) {
  if (!faculty) return false;
  const f = faculty.trim();
  if (f.includes("研究科") || f.includes("大学院")) return false;
  return f.endsWith("学部");
}

// ---- 学部 → キャンパス（多摩以外だけ明示） ----------------------------------
function campusFromFaculty(faculty) {
  if (!faculty) return null;
  const f = faculty;
  if (f.includes("法学") || f.includes("法務研究科") || f.includes("法科大学院")) return "茗荷谷"; // 法学部は2023年度から茗荷谷
  if (f.includes("理工")) return "後楽園";
  if (f.includes("国際情報")) return "市ヶ谷田町";
  if (f.includes("戦略経営") || f.includes("ビジネススクール")) return "市ヶ谷";
  return "多摩";
}

// ---- 1ページ→レコード -------------------------------------------------------
function parseDetail(html, id) {
  const s = parseSummaryTable(html);
  if (!s || !s["授業科目名"]) return null; // 概要テーブルが無ければ無効ページ扱い
  const items = parseItems(html);
  const refText = items["テキスト・参考文献等"] || "";
  const textbooks = extractIsbns(refText);
  const faculty = normalizeFaculty(s["学部・研究科など"]) || null;
  const creditsN = parseInt(String(s["単位数"] || "").replace(/[^0-9]/g, ""), 10);
  const yearN = parseInt(String(s["年度"] || "").replace(/[^0-9]/g, ""), 10);
  return {
    id,
    year: Number.isFinite(yearN) ? yearN : null,
    faculty,
    campus: campusFromFaculty(faculty),
    course_name: s["授業科目名"] || null,
    course_code: (items["科目ナンバー"] || "").trim() || null,
    instructor: s["担当教員"] || null,
    instructor_kana: s["教員カナ氏名"] || null,
    term: s["学期"] || null,
    day_period: s["開講曜日・時限"] || null,
    year_level: s["配当年次"] || null,
    credits: Number.isFinite(creditsN) ? creditsN : null,
    language: items["授業で使用する言語"] || null,
    summary: items["授業の概要"] || null,
    objectives: items["科目目的"] || null,
    schedule: items["授業計画と内容"] || null,
    grading: items["成績評価の方法・基準"] || null,
    references_raw: refText || null,
    other_notes: items["その他特記事項"] || null,
    ref_url: items["参考URL"] || null,
    textbooks,
    raw_items: items,
    source_url: `${BASE}${id}`,
    scraped_at: new Date().toISOString(),
  };
}

// ---- 取得（404はスキップ、その他はバックオフ再試行） ------------------------
async function fetchDetail(id) {
  const url = `${BASE}${id}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status === 404) return { status: 404 };
      if (!res.ok) {
        if (attempt < 3) { await sleep(1000 * (attempt + 1)); continue; }
        return { status: res.status };
      }
      return { status: 200, html: await res.text() };
    } catch (e) {
      if (attempt < 3) { await sleep(1000 * (attempt + 1)); continue; }
      throw e;
    }
  }
  return { status: 0 };
}

// ---- バッチ書き込み ---------------------------------------------------------
// Supabase 書き込みは一時的な `fetch failed` 等で失敗し得るため、各操作をリトライで包む
// （長時間ジョブが1回のネットワーク瞬断で全体死しないように）。冪等なので再試行は安全。
async function withRetry(label, fn) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { error } = await fn();
      if (!error) return;
      if (attempt >= 4) throw new Error(`${label}: ${error.message}`);
    } catch (e) {
      if (attempt >= 4) throw new Error(`${label}: ${e.message}`);
    }
    await sleep(1500 * (attempt + 1)); // 1.5s,3s,4.5s,6s のバックオフ
  }
}

async function flush(rows) {
  if (!rows.length) return;
  const courses = rows.map(({ textbooks, ...r }) => ({ ...r, textbooks, updated_at: new Date().toISOString() }));
  await withRetry("syllabus_courses upsert", () =>
    admin.from("syllabus_courses").upsert(courses, { onConflict: "id" }),
  );

  // 科目ごとに textbooks を作り直す（この科目の既存行を消してから入れる＝冪等）
  const ids = rows.map((r) => r.id);
  await withRetry("syllabus_textbooks delete", () =>
    admin.from("syllabus_textbooks").delete().in("course_id", ids),
  );
  const tRows = rows.flatMap((r) =>
    (r.textbooks || []).map((t) => ({ course_id: r.id, isbn13: t.isbn13, isbn_raw: t.isbn_raw })),
  );
  if (tRows.length) {
    await withRetry("syllabus_textbooks insert", () => admin.from("syllabus_textbooks").insert(tRows));
  }
}

// ---- メイン -----------------------------------------------------------------
async function main() {
  console.log(
    `[scrape] range=${FROM}..${TO} delay=${DELAY}ms limit=${LIMIT === Infinity ? "∞" : LIMIT} ` +
      `${DRY_RUN ? "(DRY-RUN: DB書込みなし)" : "(DBへ書込み)"}`,
  );
  const stats = { scanned: 0, found: 0, notFound: 0, errors: 0, skippedGrad: 0, withTextbook: 0, isbns: 0 };
  let batch = [];

  for (let id = FROM; id <= TO; id++) {
    if (stats.found >= LIMIT) break;
    stats.scanned++;
    let res;
    try {
      res = await fetchDetail(id);
    } catch (e) {
      stats.errors++;
      console.warn(`[scrape] id=${id} 取得失敗: ${e.message}`);
      await sleep(DELAY);
      continue;
    }
    if (res.status === 404) {
      stats.notFound++;
    } else if (res.status !== 200) {
      stats.errors++;
      console.warn(`[scrape] id=${id} HTTP ${res.status}`);
    } else {
      const rec = parseDetail(res.html, id);
      if (!rec) {
        stats.notFound++;
      } else if (!isUndergraduate(rec.faculty)) {
        // 大学院・研究科などは保存しない（学部課程のみ対象）。
        stats.skippedGrad++;
      } else {
        stats.found++;
        if (rec.textbooks.length) { stats.withTextbook++; stats.isbns += rec.textbooks.length; }
        if (VERBOSE || DRY_RUN) {
          const tb = rec.textbooks.map((t) => t.isbn13).join(",") || "-";
          console.log(`  id=${id} [${rec.faculty ?? "?"}] ${rec.course_name}  ISBN:${tb}`);
        }
        if (!DRY_RUN) {
          batch.push(rec);
          if (batch.length >= BATCH) { await flush(batch); batch = []; }
        }
      }
    }
    if (stats.scanned % 200 === 0) {
      console.log(
        `[scrape] ...id=${id} scanned=${stats.scanned} found=${stats.found} 404=${stats.notFound} err=${stats.errors}`,
      );
    }
    await sleep(DELAY);
  }
  if (!DRY_RUN && batch.length) await flush(batch);

  console.log("[scrape] 完了:");
  console.log(
    `  走査 ${stats.scanned} / 学部保存 ${stats.found} / 大学院スキップ ${stats.skippedGrad} / 不在(404等) ${stats.notFound} / エラー ${stats.errors}`,
  );
  console.log(`  教科書ありの科目 ${stats.withTextbook} / 抽出ISBN総数 ${stats.isbns}`);
}

main().catch((e) => {
  console.error("[scrape] 失敗:", e.message);
  process.exit(1);
});
