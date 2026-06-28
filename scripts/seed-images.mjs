// ===================================================
// TETOMI: 出品ダミー画像の生成 & Storage 投入（開発・デモ用）
//
//   node scripts/seed-images.mjs        (= npm run seed:images)
//
// 各 listing にコード生成した「書影風 SVG」を Storage(listing-images) へ
// アップロードし、公開URLを listings.image_urls に書き戻す。
// 外部の画像サービスに依存せず自己完結。何度流しても安全（upsert + 上書き）。
//
// 認証: service role キー（RLS バイパス）を使う。
//   ※このプロジェクトは非対称JWT(ES256)署名キーを使っており、Storage サービスが
//     ユーザートークンを検証できず authenticated でのアップロードが 400 になる。
//     そのため seeding は service role で投入する（lib/supabase/admin.ts と同経路）。
//
// 必要な環境変数（.env.local から自動読込）:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   ← Supabase ダッシュボード → Settings → API → service_role
// ===================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUCKET = "listing-images";

// --- .env.local を読み込む ---
function loadEnv() {
  const envPath = resolve(__dirname, "..", ".env.local");
  try {
    if (typeof process.loadEnvFile === "function") {
      process.loadEnvFile(envPath);
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = val;
    }
  } catch {
    /* env が直接渡っていれば動く */
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "[seed-images] NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。\n" +
      "  .env.local に SUPABASE_SERVICE_ROLE_KEY（Supabase ダッシュボード → Settings → API → service_role）を設定してください。",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- 文字列ユーティリティ ---
function escapeXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// 日本語は空白が無いので文字数で折る
function wrap(text, perLine, maxLines) {
  const chars = [...String(text ?? "")];
  const lines = [];
  for (let i = 0; i < chars.length; i += perLine) {
    lines.push(chars.slice(i, i + perLine).join(""));
    if (lines.length === maxLines) break;
  }
  if (chars.length > perLine * maxLines) {
    lines[maxLines - 1] = [...lines[maxLines - 1]].slice(0, perLine - 1).join("") + "…";
  }
  return lines;
}

function hueFromString(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

const FONT = "'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP','Yu Gothic',sans-serif";

function coverSvg({ title, subject, author }) {
  const hue = hueFromString(title);
  const bg1 = `hsl(${hue} 55% 38%)`;
  const bg2 = `hsl(${(hue + 28) % 360} 60% 26%)`;
  const accent = `hsl(${(hue + 12) % 360} 70% 72%)`;
  const titleLines = wrap(title, 9, 4);
  const titleStartY = 360 - (titleLines.length - 1) * 28;
  const titleTspans = titleLines
    .map((ln, i) => `<tspan x="300" y="${titleStartY + i * 56}">${escapeXml(ln)}</tspan>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="800" fill="url(#g)"/>
  <rect x="40" y="40" width="520" height="720" fill="none" stroke="${accent}" stroke-width="3" opacity="0.6"/>
  <rect x="0" y="0" width="18" height="800" fill="rgba(0,0,0,0.18)"/>
  <text x="300" y="150" text-anchor="middle" font-family="${FONT}" font-size="30" fill="${accent}" font-weight="700">${escapeXml(subject || "教科書")}</text>
  <text x="300" text-anchor="middle" font-family="${FONT}" font-size="44" fill="#ffffff" font-weight="700">${titleTspans}</text>
  <text x="300" y="640" text-anchor="middle" font-family="${FONT}" font-size="26" fill="rgba(255,255,255,0.92)">${escapeXml(author || "")}</text>
  <text x="300" y="730" text-anchor="middle" font-family="${FONT}" font-size="20" fill="rgba(255,255,255,0.6)" letter-spacing="4">TETOMI</text>
</svg>`;
}

function detailSvg({ title, condition }) {
  const hue = hueFromString(title);
  const bg = `hsl(${hue} 18% 92%)`;
  const fg = `hsl(${hue} 45% 30%)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
  <rect width="600" height="800" fill="${bg}"/>
  <rect x="60" y="120" width="480" height="560" rx="10" fill="#ffffff" stroke="${fg}" stroke-width="2" opacity="0.9"/>
  ${Array.from({ length: 9 }, (_, i) => `<rect x="110" y="${190 + i * 48}" width="${380 - (i % 3) * 40}" height="10" rx="5" fill="${fg}" opacity="0.18"/>`).join("")}
  <text x="300" y="700" text-anchor="middle" font-family="${FONT}" font-size="28" fill="${fg}" font-weight="700">状態: ${escapeXml(condition || "—")}</text>
</svg>`;
}

async function uploadSvg(path, svg) {
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, new Blob([svg], { type: "image/svg+xml" }), {
      contentType: "image/svg+xml",
      upsert: true,
    });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function main() {
  const { data: listings, error } = await admin
    .from("listings")
    .select("id, title, subject, author, condition")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`fetch listings: ${error.message}`);
  if (!listings?.length) {
    console.log("[seed-images] listings が空です。先に docs/supabase-seed.sql を投入してください。");
    return;
  }

  let i = 0;
  for (const l of listings) {
    const urls = [];
    urls.push(await uploadSvg(`seed/${l.id}.svg`, coverSvg(l)));
    // 3件に1件は状態イメージの2枚目も付ける（ギャラリー表示の確認用）
    if (i % 3 === 0) {
      urls.push(await uploadSvg(`seed/${l.id}-2.svg`, detailSvg(l)));
    }
    const { error: upErr } = await admin.from("listings").update({ image_urls: urls }).eq("id", l.id);
    if (upErr) throw new Error(`update ${l.id}: ${upErr.message}`);
    i += 1;
    console.log(`[seed-images] ${i}/${listings.length}  ${l.title}  (${urls.length} 枚)`);
  }
  console.log(`[seed-images] 完了: ${listings.length} 件に画像を付与しました。`);
}

main().catch((e) => {
  console.error("[seed-images] 失敗:", e.message);
  process.exit(1);
});
