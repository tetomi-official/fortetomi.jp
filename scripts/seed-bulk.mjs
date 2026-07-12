// ===================================================
// TETOMI: 学部内ダミー出品の一括追加（開発・デモ用）
//
//   node scripts/seed-bulk.mjs        (= npm run seed:bulk)
//
// 各学部に「追加の出品者」を複数作り、それぞれ複数冊を出品する。
// これにより、どのアカウントでログインしても（＝自分の出品を除いても）
// 同学部の他の人の出品が十分に並ぶ。教科書名は学部の科目×テンプレで生成し、
// 書影SVGも自動でアップロードする。
//
// 認証: service role（RLS バイパス）。.env.local から読込:
//   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//
// 冪等: メールが "bulk." で始まるユーザーを毎回削除してから作り直す。
// ===================================================

import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(new URL("../.env.local", import.meta.url));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("[seed-bulk] NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です（.env.local）。");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const PASSWORD = "password123";
const BUCKET = "listing-images";
const SELLERS_PER_FACULTY = 3;
const LISTINGS_PER_SELLER = 4;

// 学部 → { key, subjects[] }
const FACULTIES = [
  { name: "法学部", key: "law", subjects: ["民法", "刑法", "憲法", "行政法", "商法", "労働法", "国際法", "刑事訴訟法"] },
  { name: "経済学部", key: "econ", subjects: ["マクロ経済学", "ミクロ経済学", "計量経済学", "金融論", "財政学", "統計学", "経済史", "ゲーム理論"] },
  { name: "商学部", key: "biz", subjects: ["会計学", "経営学", "マーケティング", "簿記", "ファイナンス", "経営戦略", "商業簿記", "流通論"] },
  { name: "理工学部", key: "sci", subjects: ["線形代数", "微分積分", "物理学", "プログラミング", "データ構造", "電磁気学", "確率統計", "化学"] },
  { name: "文学部", key: "lit", subjects: ["日本文学", "西洋史", "心理学", "社会学", "哲学", "言語学", "英文学", "美学"] },
  { name: "総合政策学部", key: "policy", subjects: ["公共政策", "国際関係論", "政治学", "環境政策", "地方自治", "行政学", "政策分析", "社会調査"] },
  { name: "国際経営学部", key: "gmgmt", subjects: ["国際経営", "グローバル経営", "異文化経営", "国際マーケティング", "経営組織", "ビジネス英語", "国際財務", "経営戦略論"] },
  { name: "国際情報学部", key: "ginfo", subjects: ["情報科学", "データサイエンス", "ネットワーク", "プログラミング", "人工知能", "情報法", "情報セキュリティ", "情報倫理"] },
];

const TEMPLATES = ["{s}入門", "{s}概論", "基礎{s}", "{s}の基礎", "よくわかる{s}", "新版 {s}", "{s} 第2版", "エッセンシャル{s}"];
const SURNAMES = ["伊藤", "山田", "中川", "小川", "藤井", "岡本", "松本", "森田", "池田", "後藤", "村田", "石井", "和田", "大野", "上田", "福田", "横山", "三浦", "野口", "竹内", "工藤", "新井", "菅原", "宮崎"];
const GIVEN = [
  { n: "陽斗", g: "男性" }, { n: "美咲", g: "女性" }, { n: "蓮", g: "男性" }, { n: "葵", g: "女性" },
  { n: "悠真", g: "男性" }, { n: "結菜", g: "女性" }, { n: "大翔", g: "男性" }, { n: "陽菜", g: "女性" },
  { n: "颯", g: "男性" }, { n: "莉子", g: "女性" }, { n: "湊", g: "男性" }, { n: "凜", g: "女性" },
];
const GRADES = ["1年", "2年", "3年", "4年"];
const CONDITIONS = ["新品・未使用", "書き込みなし", "書き込み少し", "汚れ・ダメージあり"];
const PUBLISHERS = ["有斐閣", "岩波書店", "東京大学出版会", "中央経済社", "オーム社", "日本評論社", "弘文堂", "ミネルヴァ書房", "共立出版", "丸善出版"];
const DESCRIPTIONS = [
  "状態良好です。書き込みはほとんどありません。",
  "授業で使いました。マーカー跡が少しあります。",
  "ほぼ未使用の美品です。",
  "カバーにスレがありますが本体はきれいです。",
  "付箋の跡が少しあります。内容は問題なく使えます。",
  "通読のみ。きれいな状態です。",
];

// 決定的乱数（再実行で同じ結果。索引ベース）
function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 0xffffffff;
  };
}
function pick(arr, r) {
  return arr[Math.floor(r() * arr.length)];
}

// --- 書影SVG ---
function escapeXml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function wrap(text, perLine, maxLines) {
  const chars = [...String(text ?? "")];
  const lines = [];
  for (let i = 0; i < chars.length; i += perLine) {
    lines.push(chars.slice(i, i + perLine).join(""));
    if (lines.length === maxLines) break;
  }
  if (chars.length > perLine * maxLines) lines[maxLines - 1] = [...lines[maxLines - 1]].slice(0, perLine - 1).join("") + "…";
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
  const titleLines = wrap(title, 9, 4);
  const startY = 360 - (titleLines.length - 1) * 28;
  const tspans = titleLines.map((ln, i) => `<tspan x="300" y="${startY + i * 56}">${escapeXml(ln)}</tspan>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 55% 38%)"/><stop offset="1" stop-color="hsl(${(hue + 28) % 360} 60% 26%)"/></linearGradient></defs>
  <rect width="600" height="800" fill="url(#g)"/>
  <rect x="40" y="40" width="520" height="720" fill="none" stroke="hsl(${(hue + 12) % 360} 70% 72%)" stroke-width="3" opacity="0.6"/>
  <rect x="0" y="0" width="18" height="800" fill="rgba(0,0,0,0.18)"/>
  <text x="300" y="150" text-anchor="middle" font-family="${FONT}" font-size="30" fill="hsl(${(hue + 12) % 360} 70% 72%)" font-weight="700">${escapeXml(subject)}</text>
  <text x="300" text-anchor="middle" font-family="${FONT}" font-size="44" fill="#fff" font-weight="700">${tspans}</text>
  <text x="300" y="640" text-anchor="middle" font-family="${FONT}" font-size="26" fill="rgba(255,255,255,0.92)">${escapeXml(author)}</text>
  <text x="300" y="730" text-anchor="middle" font-family="${FONT}" font-size="20" fill="rgba(255,255,255,0.6)" letter-spacing="4">TETOMI</text>
</svg>`;
}

async function cleanup() {
  // 既存の bulk ユーザーを削除（listings は cascade で道連れ）
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const targets = data.users.filter((u) => (u.email ?? "").startsWith("bulk."));
  for (const u of targets) await admin.auth.admin.deleteUser(u.id);
  console.log(`[seed-bulk] 既存 bulk ユーザー削除: ${targets.length} 名`);
  // 旧 seed-bulk 画像の掃除（ベストエフォート）
  const { data: objs } = await admin.storage.from(BUCKET).list("seed-bulk", { limit: 1000 });
  if (objs?.length) await admin.storage.from(BUCKET).remove(objs.map((o) => `seed-bulk/${o.name}`));
}

function nextAprilFirstJST() {
  const now = new Date();
  // JST の翌年4/1（在籍有効）。ざっくり UTC で 3/31T15:00Z = 4/1 JST。
  return new Date(Date.UTC(now.getUTCFullYear() + 1, 3, 1, 0, 0, 0)).toISOString();
}

async function main() {
  await cleanup();
  const validUntil = nextAprilFirstJST();
  let sellerCount = 0;
  let listingCount = 0;

  for (let fi = 0; fi < FACULTIES.length; fi++) {
    const fac = FACULTIES[fi];
    // 学部内でタイトルが被らないように順番に組み立てる
    let titleIdx = 0;
    const nextTitle = () => {
      const s = fac.subjects[titleIdx % fac.subjects.length];
      const t = TEMPLATES[Math.floor(titleIdx / fac.subjects.length) % TEMPLATES.length];
      titleIdx++;
      return { title: t.replace("{s}", s), subject: s };
    };

    for (let si = 0; si < SELLERS_PER_FACULTY; si++) {
      const r = rng(fi * 100 + si + 1);
      const surname = SURNAMES[(fi * SELLERS_PER_FACULTY + si) % SURNAMES.length];
      const given = GIVEN[(fi * 3 + si * 5 + 1) % GIVEN.length];
      const name = `${surname} ${given.n}`;
      const email = `bulk.${fac.key}.${si + 1}@g.chuo-u.ac.jp`;
      const grade = GRADES[Math.floor(r() * GRADES.length)];

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: {
          name,
          university: "中央大学",
          faculty: fac.name,
          grade,
          gender: given.g,
          personal_email: `${fac.key}${si + 1}.demo@example.com`,
        },
      });
      if (cErr) {
        console.warn(`[seed-bulk] ${email} 作成失敗: ${cErr.message} → スキップ`);
        continue;
      }
      const uid = created.user.id;
      // 在籍有効・評価を付与（handle_new_user が作った profiles 行を更新）
      await admin.from("profiles").update({
        enrollment_verified: true,
        enrollment_valid_until: validUntil,
        rating: Math.round((3.8 + r() * 1.2) * 10) / 10,
        rating_count: 1 + Math.floor(r() * 25),
      }).eq("id", uid);
      sellerCount++;

      // 出品を作成
      const rows = [];
      for (let li = 0; li < LISTINGS_PER_SELLER; li++) {
        const { title, subject } = nextTitle();
        const author = `${pick(SURNAMES, r)}${pick(["", "", "編", "監修"], r)}`;
        // 各出品者の最初の2冊は必ず出品中（除外しても十分残るように）
        const status = li < 2 ? "出品中" : r() < 0.2 ? "予約済み" : "出品中";
        const daysAgo = Math.floor(r() * 30);
        rows.push({
          title,
          subject,
          author,
          publisher: pick(PUBLISHERS, r),
          publication_year: String(2013 + Math.floor(r() * 12)),
          description: pick(DESCRIPTIONS, r),
          category: "教科書",
          condition: pick(CONDITIONS, r),
          price: (5 + Math.floor(r() * 31)) * 100, // 500〜3500
          location: "Forest Gateway 3F",
          image_urls: [],
          seller_id: uid,
          status,
          views: Math.floor(r() * 60),
          likes: Math.floor(r() * 12),
          created_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
        });
      }
      const { data: inserted, error: iErr } = await admin.from("listings").insert(rows).select("id, title, subject, author");
      if (iErr) {
        console.warn(`[seed-bulk] ${name} の出品挿入失敗: ${iErr.message}`);
        continue;
      }
      // 書影アップロード
      for (const l of inserted) {
        const path = `seed-bulk/${l.id}.svg`;
        const { error: upErr } = await admin.storage.from(BUCKET).upload(path, new Blob([coverSvg(l)], { type: "image/svg+xml" }), { contentType: "image/svg+xml", upsert: true });
        if (upErr) { console.warn(`[seed-bulk] 画像失敗 ${l.title}: ${upErr.message}`); continue; }
        const pub = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        await admin.from("listings").update({ image_urls: [pub] }).eq("id", l.id);
      }
      listingCount += inserted.length;
      console.log(`[seed-bulk] ${fac.name} / ${name}（${email}）: ${inserted.length} 冊`);
    }
  }
  console.log(`[seed-bulk] 完了: 出品者 ${sellerCount} 名 / 出品 ${listingCount} 件を追加（全員 password123）。`);
}

main().catch((e) => {
  console.error("[seed-bulk] 失敗:", e.message);
  process.exit(1);
});
