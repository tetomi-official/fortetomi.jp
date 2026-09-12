// ===================================================
// 出品フローの画面遷移図（1枚HTML）を組み立てる。
//
//   node scripts/capture-flow.mjs      # 先にスクショを撮る
//   node scripts/build-flow-doc.mjs    # このスクリプトでHTMLを生成
//
// docs/screens/small/{pc,sp} の JPEG を base64 で埋め込むので、
// 出力された HTML 1ファイルだけで完結する（外部リクエストなし）。
// 出力先: docs/flow-sell.html
// ===================================================

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SMALL = path.resolve("docs/screens/small");
const OUT = path.resolve("docs/flow-sell.html");

/**
 * 画面カード1枚ぶんの説明。
 *   file    : docs/screens/small/{pc,sp}/<file>.jpg
 *   route   : URL パス
 *   act     : この画面でユーザーがすること
 *   sys     : 裏側で起きること
 *   src     : 対応するソース
 *   arrow   : 次の画面へ進むきっかけ（最後の画面は null）
 *   note    : 補足（つまずきポイント等。type は "gate" | "info"）
 *   optional: 本筋から外れる寄り道の画面か
 */
const SCREENS = [
  {
    file: "01-top-guest",
    name: "トップ（ログイン前）",
    route: "/",
    act: "「今すぐ出品する」またはヘッダーの「出品する」を押す。",
    sys: "未ログインでも見られるのはトップだけ。一覧・出品はログインが必要。",
    src: "app/page.tsx",
    arrow: "「出品する」／「ログイン」を押す",
  },
  {
    file: "02-login",
    name: "ログイン",
    route: "/login",
    act: "大学メールとパスワードでログイン。動作確認用のデモユーザーのボタンもここ。",
    sys: "Supabase Auth でサインイン。成功するとトップへ戻る。",
    src: "app/login/page.tsx",
    arrow: "ログイン成功 → トップへ戻る",
  },
  {
    file: "03-top-loggedin",
    name: "トップ（ログイン後）",
    route: "/",
    act: "ヘッダーの「出品する」を押す。",
    sys: "ヘッダーが自分の名前入りに変わり、学部の出品数が表示される。",
    src: "components/Navbar.tsx",
    arrow: "ヘッダーの「＋ 出品する」",
  },
  {
    file: "04-listings",
    name: "教科書一覧（寄り道）",
    route: "/listings",
    act: "自分の学部で出品されている教科書を眺める。出品フローとは別ルート。",
    sys: "在籍が有効な出品者の「出品中」だけが並ぶ。",
    src: "app/listings/page.tsx",
    arrow: null,
    optional: true,
  },
  {
    file: "05-sell-step1-empty",
    name: "出品 STEP1 — 基本情報（空）",
    route: "/sell",
    act: "教科書タイトル・授業名などを入力。ISBNはバーコードのスキャンからも入れられる。",
    sys: "3ステップのうちの1つ目。ここまでは何も保存されない。",
    src: "app/sell/page.tsx",
    arrow: "入力する",
  },
  {
    file: "06-sell-step1-filled",
    name: "出品 STEP1 — 入力後",
    route: "/sell",
    act: "写真を2枚以上（表紙・裏表紙）追加して「次へ」。",
    sys: "写真はまだブラウザの中だけ。プレビュー表示のみで、アップロードはしていない。",
    src: "app/sell/page.tsx:251",
    arrow: "「次へ」を押す",
    note: {
      type: "gate",
      text: "タイトル・授業名が空、または写真が2枚未満だと「次へ」で止まり、赤い通知が出る。",
    },
  },
  {
    file: "07-sell-step2",
    name: "出品 STEP2 — 状態・価格",
    route: "/sell",
    act: "教科書の状態を4つから選び、価格と受け渡し場所を入力して「確認へ」。",
    sys: "手数料10%を引いた受け取り額をその場で計算して表示する。",
    src: "app/sell/page.tsx:614",
    arrow: "「確認へ」を押す",
    note: {
      type: "gate",
      text: "状態・価格・受け渡し場所のどれかが空だと先に進めない。",
    },
  },
  {
    file: "08-sell-step3-confirm",
    name: "出品 STEP3 — 確認",
    route: "/sell",
    act: "一覧に並ぶ見た目のプレビューと出品者情報を確認して「出品する」。",
    sys: "ここまで書き込みはゼロ。押した瞬間に初めて外に出る。",
    src: "app/sell/page.tsx:656",
    arrow: "「出品する」を押す",
  },
  {
    file: "09-sell-done",
    name: "出品完了",
    route: "/sell",
    act: "「一覧を見る」か「マイページ」へ進む。",
    sys: "写真を Storage にアップロードし、出品を1件登録。以降ほかの学生の一覧に並ぶ。",
    src: "app/sell/page.tsx:273",
    arrow: "「マイページ」を押す",
    done: true,
    note: {
      type: "info",
      text: "画像アップロードとデータベース登録が走るのはこのボタンだけ。ここまでは何度やり直しても記録は残らない。",
    },
  },
  {
    file: "10-mypage-listings",
    name: "マイページ — 出品中の教科書",
    route: "/mypage",
    act: "出品した教科書の編集・完了・削除ができる。購入希望が届くとここに通知が出る。",
    sys: "自分が出品者の行だけが見える。",
    src: "app/mypage/page.tsx:616",
    arrow: null,
  },
];

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function dataUri(device, file) {
  const buf = await readFile(path.join(SMALL, device, `${file}.jpg`));
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

function stepCard(s, index, pc, sp) {
  const num = String(index + 1).padStart(2, "0");
  const noteHtml = s.note
    ? `<p class="note note-${s.note.type}"><span class="note-label">${
        s.note.type === "gate" ? "進めない条件" : "ここで起きること"
      }</span>${esc(s.note.text)}</p>`
    : "";
  return `
      <section class="step${s.optional ? " step-optional" : ""}${s.done ? " step-done" : ""}">
        <div class="rail"><span class="rail-num">${num}</span></div>
        <article class="card">
          <header class="card-head">
            <h2>${esc(s.name)}</h2>
            <code class="route">${esc(s.route)}</code>
            ${s.optional ? '<span class="tag">任意</span>' : ""}
            ${s.done ? '<span class="tag tag-done">ゴール</span>' : ""}
          </header>
          <div class="card-body">
            <button class="shotbtn" type="button" data-title="${esc(
              `${num} ${s.name}`,
            )}" aria-label="${esc(s.name)}のスクリーンショットを拡大">
              <img class="shot shot-pc" src="${pc}" alt="${esc(s.name)}のPC画面" loading="lazy" />
              <img class="shot shot-sp" src="${sp}" alt="${esc(s.name)}のスマホ画面" loading="lazy" />
              <span class="zoom">拡大</span>
            </button>
            <div class="desc">
              <p class="line"><span class="who who-user">ユーザー</span>${esc(s.act)}</p>
              <p class="line"><span class="who who-sys">システム</span>${esc(s.sys)}</p>
              ${noteHtml}
              <p class="src"><code>${esc(s.src)}</code></p>
            </div>
          </div>
        </article>
      </section>${
        s.arrow
          ? `
      <div class="arrow"><span class="arrow-line" aria-hidden="true"></span><span class="arrow-label">${esc(
        s.arrow,
      )}</span></div>`
          : ""
      }`;
}

async function main() {
  const cards = [];
  for (const [i, s] of SCREENS.entries()) {
    const [pc, sp] = await Promise.all([dataUri("pc", s.file), dataUri("sp", s.file)]);
    cards.push(stepCard(s, i, pc, sp));
  }

  const html = `<title>TETOMI 出品フロー 画面遷移図</title>
<style>
  :root {
    --ink: #14314A;
    --ink-soft: #3d5a6e;
    --muted: #7a93a5;
    --paper: #EDF0F3;
    --card: #ffffff;
    --line: #d3dae0;
    --accent: #059669;
    --warn: #b45309;
    --shadow: 0 1px 2px rgba(20,49,74,.06), 0 8px 24px rgba(20,49,74,.07);
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    --ja: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic Medium", "Noto Sans JP", system-ui, sans-serif;
    --maxw: 1000px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ink: #dbe6ee;
      --ink-soft: #b3c6d3;
      --muted: #8aa4b6;
      --paper: #0d1b28;
      --card: #142b3d;
      --line: #26445b;
      --accent: #34d399;
      --warn: #f0b45e;
      --shadow: 0 1px 2px rgba(0,0,0,.4), 0 10px 28px rgba(0,0,0,.28);
    }
  }
  :root[data-theme="dark"] {
    --ink: #dbe6ee; --ink-soft: #b3c6d3; --muted: #8aa4b6;
    --paper: #0d1b28; --card: #142b3d; --line: #26445b;
    --accent: #34d399; --warn: #f0b45e;
    --shadow: 0 1px 2px rgba(0,0,0,.4), 0 10px 28px rgba(0,0,0,.28);
  }
  :root[data-theme="light"] {
    --ink: #14314A; --ink-soft: #3d5a6e; --muted: #7a93a5;
    --paper: #EDF0F3; --card: #ffffff; --line: #d3dae0;
    --accent: #059669; --warn: #b45309;
    --shadow: 0 1px 2px rgba(20,49,74,.06), 0 8px 24px rgba(20,49,74,.07);
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--ja);
    line-height: 1.75;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 20px 96px; }

  /* --- ヘッダー --- */
  .top { padding: 56px 0 28px; }
  .eyebrow {
    font-family: var(--mono); font-size: 12px; letter-spacing: .16em;
    text-transform: uppercase; color: var(--muted); margin: 0 0 10px;
  }
  h1 {
    font-size: clamp(26px, 4.2vw, 38px); line-height: 1.3; margin: 0 0 14px;
    letter-spacing: .01em; text-wrap: balance; font-weight: 800;
  }
  .lede { margin: 0; max-width: 62ch; color: var(--ink-soft); font-size: 15px; }

  .bar {
    position: sticky; top: 0; z-index: 20;
    display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between;
    padding: 12px 0; margin: 24px 0 8px;
    background: color-mix(in srgb, var(--paper) 96%, transparent);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--line);
  }
  .seg { display: inline-flex; background: var(--card); border: 1px solid var(--line); border-radius: 999px; padding: 3px; }
  .seg button {
    font: 600 13px/1 var(--ja); color: var(--ink-soft); background: none; border: 0;
    padding: 9px 20px; border-radius: 999px; cursor: pointer;
  }
  .seg button[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
  .seg button:focus-visible, .shotbtn:focus-visible, .close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .count { font-family: var(--mono); font-size: 12px; color: var(--muted); letter-spacing: .04em; }

  /* --- ステップ --- */
  .step { display: grid; grid-template-columns: 56px 1fr; gap: 0 16px; align-items: start; }
  .rail { display: flex; justify-content: center; padding-top: 18px; }
  .rail-num {
    font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--ink-soft);
    width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--line);
    background: var(--card); display: grid; place-items: center;
    font-variant-numeric: tabular-nums;
  }
  .step-done .rail-num { border-color: var(--accent); color: var(--accent); }
  .step-optional .card { border-style: dashed; }

  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 12px;
    box-shadow: var(--shadow); overflow: hidden;
  }
  .card-head {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 12px;
    padding: 16px 18px; border-bottom: 1px solid var(--line);
  }
  .card-head h2 { font-size: 17px; margin: 0; font-weight: 700; letter-spacing: .01em; }
  .route { font-family: var(--mono); font-size: 12px; color: var(--muted); }
  .tag {
    font-family: var(--mono); font-size: 11px; letter-spacing: .06em;
    border: 1px solid var(--line); border-radius: 999px; padding: 2px 9px; color: var(--muted);
  }
  .tag-done { border-color: var(--accent); color: var(--accent); }

  .card-body { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr); gap: 20px; padding: 18px; }
  @media (max-width: 720px) { .card-body { grid-template-columns: 1fr; } }

  .shotbtn {
    position: relative; padding: 0; border: 1px solid var(--line); border-radius: 8px;
    background: var(--paper); cursor: zoom-in; overflow: hidden; display: block; max-height: 320px;
  }
  .shot { display: block; width: 100%; height: auto; }
  .shotbtn::after {
    content: ""; position: absolute; inset: auto 0 0 0; height: 56px;
    background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--card) 92%, transparent));
  }
  .zoom {
    position: absolute; right: 8px; bottom: 8px; z-index: 1;
    font-family: var(--mono); font-size: 11px; letter-spacing: .06em;
    background: var(--ink); color: var(--paper); border-radius: 999px; padding: 3px 10px; opacity: .82;
  }
  .shotbtn:hover .zoom { opacity: 1; }

  .desc { display: flex; flex-direction: column; gap: 10px; }
  .line { margin: 0; font-size: 14px; color: var(--ink-soft); }
  .who {
    display: inline-block; min-width: 68px; margin-right: 10px;
    font-family: var(--mono); font-size: 11px; letter-spacing: .06em; text-align: center;
    border-radius: 4px; padding: 1px 6px; vertical-align: 2px;
  }
  .who-user { background: color-mix(in srgb, var(--ink) 12%, transparent); color: var(--ink); }
  .who-sys { background: color-mix(in srgb, var(--muted) 22%, transparent); color: var(--ink-soft); }
  .note {
    margin: 2px 0 0; font-size: 13px; line-height: 1.7; color: var(--ink-soft);
    border-left: 2px solid var(--line); padding: 4px 0 4px 12px;
  }
  .note-gate { border-left-color: var(--warn); }
  .note-info { border-left-color: var(--accent); }
  .note-label {
    display: block; font-family: var(--mono); font-size: 11px; letter-spacing: .06em; color: var(--muted);
  }
  .src { margin: 4px 0 0; }
  .src code { font-family: var(--mono); font-size: 11.5px; color: var(--muted); }

  /* --- 矢印 --- */
  .arrow { display: grid; grid-template-columns: 56px 1fr; align-items: center; gap: 0 16px; padding: 6px 0; }
  .arrow-line {
    grid-column: 1; justify-self: center; width: 1px; height: 42px;
    background: linear-gradient(to bottom, var(--line), var(--muted));
    position: relative;
  }
  .arrow-line::after {
    content: ""; position: absolute; left: 50%; bottom: -1px; transform: translateX(-50%);
    border-left: 4px solid transparent; border-right: 4px solid transparent;
    border-top: 6px solid var(--muted);
  }
  .arrow-label { grid-column: 2; font-size: 13px; color: var(--muted); font-weight: 600; }

  /* --- 補足 --- */
  .foot { margin-top: 44px; border-top: 1px solid var(--line); padding-top: 24px; }
  .foot h3 { font-size: 14px; margin: 0 0 10px; letter-spacing: .02em; }
  .foot ul { margin: 0; padding-left: 1.2em; color: var(--ink-soft); font-size: 13.5px; }
  .foot li { margin-bottom: 6px; }
  .foot code { font-family: var(--mono); font-size: 12px; }

  /* --- 拡大表示 --- */
  dialog.lb {
    border: 0; padding: 0; background: transparent; max-width: 100vw; max-height: 100vh;
    width: 100%; height: 100%;
  }
  dialog.lb::backdrop { background: rgba(6,18,28,.86); }
  /* ::backdrop に頼らず自前で暗い面を敷く（環境差で背景が抜けないように） */
  .lb-inner { height: 100%; display: flex; flex-direction: column; background: rgba(7,19,29,.95); }
  .lb-head {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 12px 16px; color: #e7eef4; font-family: var(--mono); font-size: 12px; letter-spacing: .06em;
  }
  .close {
    background: none; border: 1px solid rgba(255,255,255,.4); color: #e7eef4;
    border-radius: 999px; padding: 6px 14px; font: 600 12px/1 var(--ja); cursor: pointer;
  }
  .lb-scroll { flex: 1; overflow: auto; padding: 0 16px 24px; }
  .lb-scroll img { display: block; margin: 0 auto; max-width: min(1000px, 100%); border-radius: 8px; }

  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }

  /* PC / スマホ の出し分け */
  body[data-device="pc"] .shot-sp, body[data-device="sp"] .shot-pc { display: none; }
  body[data-device="sp"] .shotbtn { max-width: 260px; }
</style>

<div class="wrap">
  <header class="top">
    <p class="eyebrow">TETOMI / screen flow</p>
    <h1>出品するまでの画面の流れ</h1>
    <p class="lede">
      トップを開いてから教科書を1冊出品し終えるまでを、実際の画面で追ったものです。
      各画面のスクリーンショットはクリックすると大きく見られます。PC とスマホは上のボタンで切り替えます。
    </p>
  </header>

  <div class="bar">
    <div class="seg" role="group" aria-label="表示する端末">
      <button type="button" data-device="pc" aria-pressed="true">PC</button>
      <button type="button" data-device="sp" aria-pressed="false">スマホ</button>
    </div>
    <span class="count">全 ${SCREENS.length} 画面</span>
  </div>

  <div class="flow">${cards.join("\n")}
  </div>

  <div class="foot">
    <h3>この図について</h3>
    <ul>
      <li>撮影はローカルの開発サーバーで、デモユーザー「佐藤 花子（経済学部 2年）」としてログインした状態です。</li>
      <li>公開中のサイトは今プレリリース中（<code>NEXT_PUBLIC_RELEASE_PHASE=0</code>）で、STEP1 の「次へ」が押せません。撮影時だけローカルでフェーズ2にして出品を通しています。</li>
      <li>撮り直しは <code>node scripts/capture-flow.mjs</code> → <code>node scripts/build-flow-doc.mjs</code> の2コマンドです。</li>
    </ul>
  </div>
</div>

<dialog class="lb" id="lb">
  <div class="lb-inner">
    <div class="lb-head"><span id="lb-title"></span><button type="button" class="close" id="lb-close">閉じる</button></div>
    <div class="lb-scroll"><img id="lb-img" alt="" /></div>
  </div>
</dialog>

<script>
  (function () {
    var body = document.body;
    body.dataset.device = "pc";
    document.querySelectorAll(".seg button").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = b.dataset.device;
        body.dataset.device = d;
        document.querySelectorAll(".seg button").forEach(function (o) {
          o.setAttribute("aria-pressed", String(o.dataset.device === d));
        });
      });
    });

    var lb = document.getElementById("lb");
    var lbImg = document.getElementById("lb-img");
    var lbTitle = document.getElementById("lb-title");
    document.querySelectorAll(".shotbtn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var shown = btn.querySelector(body.dataset.device === "sp" ? ".shot-sp" : ".shot-pc");
        lbImg.src = shown.src;
        lbImg.alt = btn.dataset.title;
        lbTitle.textContent = btn.dataset.title;
        lb.showModal();
      });
    });
    document.getElementById("lb-close").addEventListener("click", function () { lb.close(); });
    lb.addEventListener("click", function (e) { if (e.target === lb) lb.close(); });
  })();
</script>
`;

  await writeFile(OUT, html, "utf8");
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`生成しました: ${OUT} (${kb} KB)`);
}

main().catch((e) => {
  console.error("生成に失敗しました:", e.message);
  process.exit(1);
});
