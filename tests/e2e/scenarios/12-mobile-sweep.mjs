// スマホ幅の巡回検査（T39）＝ Tailwind 移行のガードレール。
//
// いちばん狭い実機（iPhone SE / 375px）で主要な画面を順に開き、機械的に分かる崩れを探す。
//   ① ページが横にはみ出していないか（はみ出している要素も名指しする）
//   ② 本文が固定ヘッダーの下に潜っていないか
//   ③ 一番下の中身が下タブバーに隠れていないか
//   ④ 下タブバーの4つが押せるか（出さない画面では、出ていないこと）
//   ⑤ 指で押すには小さすぎる操作が無いか
//   ⑥ 文字が箱からはみ出して黙って切れていないか
//
// 機械で分かるのはここまで。「窮屈」「読みにくい」といった見た目の良し悪しは人が見る。
//
// 画面は1つずつ Tailwind に移していくので、まだ移していない画面は「残り作業」として
// 記録するだけにして、テストは落とさない。移し終えたら下の一覧で 済み: true にすること。
// **済みにした画面が崩れたら、このテストが落ちる。** それがこの検査の役目。

import { ACCOUNTS, go, login, openPersona, wait } from "../helpers.mjs";

/** 巡回する画面。済み=true にした画面は、崩れたらテストが落ちる。 */
const 画面 = [
  { path: "/", 名前: "トップ", 済み: false, ログイン: false },
  { 下タブなし: true, path: "/login", 名前: "ログイン", 済み: true, ログイン: false },
  { 下タブなし: true, path: "/signup", 名前: "新規登録", 済み: true, ログイン: false },
  { 下タブなし: true, path: "/forgot-password", 名前: "パスワード再設定", 済み: true, ログイン: false },
  { 下タブなし: true, path: "/recover", 名前: "ログインメールの復旧", 済み: true, ログイン: false },
  { path: "/legal", 名前: "特定商取引法", 済み: false, ログイン: false },
  { path: "/terms", 名前: "利用規約", 済み: false, ログイン: false },
  { path: "/privacy", 名前: "プライバシーポリシー", 済み: false, ログイン: false },
  { path: "/listings", 名前: "教科書一覧", 済み: false, ログイン: true },
  { path: "__listing__", 名前: "教科書の詳細", 済み: true, ログイン: true },
  { path: "/sell", 名前: "出品", 済み: false, ログイン: true },
  { path: "/mypage", 名前: "マイページ", 済み: false, ログイン: true },
  { path: "/mypage?tab=messages", 名前: "マイページ（メッセージ）", 済み: false, ログイン: true },
  { path: "/sell/connect", 名前: "受取口座の登録", 済み: false, ログイン: true },
];

/**
 * 開いている画面を調べて、見つけた問題を文の配列で返す。
 * ブラウザの中で動くので、ここから外の変数は参照しないこと。
 */
function 画面を調べる(下タブなし) {
  const 問題 = []; // 画面ごとの崩れ（未移行の画面では記録だけ）
  const 共通 = []; // 共通部分の崩れ（移行済みなので、崩れたら必ず落とす）
  const 画面幅 = window.innerWidth;
  const 文書 = document.documentElement;
  const 根 = getComputedStyle(文書);
  const ヘッダー高 = parseFloat(根.getPropertyValue("--header-h")) || 0;

  // ① 横のはみ出し
  if (文書.scrollWidth > 画面幅 + 1) {
    問題.push(`ページが横にはみ出している（中身 ${文書.scrollWidth}px / 画面 ${画面幅}px）`);
  }

  // 閉じているメニューなど、見えていないものは測らない（visibility:hidden でも箱は残るため）
  const 見えている = (el) => {
    for (let p = el; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") return false;
    }
    return true;
  };

  // 横スクロールできる箱の中（意図的にはみ出させている所）は見逃す
  const 横スクロールの中 = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") return true;
    }
    return false;
  };
  const はみ出し = new Set();
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= 画面幅 + 1 && r.left >= -1) continue;
    if (!見えている(el)) continue;
    if (横スクロールの中(el)) continue;
    // 親もはみ出しているなら、いちばん外側だけを名指しする
    const 親 = el.parentElement;
    if (親 && 親 !== document.body) {
      const pr = 親.getBoundingClientRect();
      if (pr.right > 画面幅 + 1 || pr.left < -1) continue;
    }
    const cls = (el.getAttribute("class") || "").trim().split(/\s+/).slice(0, 3).join(".");
    はみ出し.add(
      `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}（左 ${Math.round(r.left)} / 右 ${Math.round(r.right)}）`,
    );
    if (はみ出し.size >= 6) break;
  }
  for (const s of はみ出し) 問題.push(`横にはみ出している: ${s}`);

  // ② 本文が固定ヘッダーの下に潜っていないか
  const 本文 = document.querySelector("main, .page-main, .hero-section");
  if (本文) {
    const r = 本文.getBoundingClientRect();
    const 上余白 = parseFloat(getComputedStyle(本文).paddingTop) || 0;
    if (r.top + 上余白 < ヘッダー高 - 1) {
      問題.push(
        `本文が固定ヘッダーの下に潜っている（本文の中身が始まるのは ${Math.round(r.top + 上余白)}px / ヘッダーの高さ ${ヘッダー高}px）`,
      );
    }
  }

  // ④ 下タブバーの4つが押せるか（押せる＝大きさがあり、画面内で、上に何も重なっていない）
  const バー = document.querySelector('nav[aria-label="メインメニュー"]');
  if (下タブなし) {
    // ログイン系は下タブバーを出さない画面。出ていたら誤り。
    if (バー) 共通.push("下タブバーを出さない画面なのに出ている");
    // 出さない画面では本文の下に余白が残っていないことも見る。
    const 余白 = getComputedStyle(document.body).paddingBottom;
    if (parseFloat(余白) > 1) 共通.push(`下タブバーが無いのに本文の下に余白が残っている（${余白}）`);
  } else if (!バー) {
    共通.push("下タブバーが無い");
  } else {
    for (const a of バー.querySelectorAll("a")) {
      const r = a.getBoundingClientRect();
      const 名 = a.innerText.replace(/\s+/g, "") || a.getAttribute("href");
      if (r.width === 0 || r.height === 0) {
        共通.push(`下タブ「${名}」の大きさが 0`);
        continue;
      }
      if (r.left < -1 || r.right > 画面幅 + 1) {
        共通.push(`下タブ「${名}」が横にはみ出している`);
        continue;
      }
      const 上 = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!上 || !(上 === a || a.contains(上) || 上.contains(a))) {
        共通.push(`下タブ「${名}」の上に別のものが重なっていて押せない（${上?.tagName ?? "なし"}）`);
      }
      // 指で押せる大きさか（iOS の目安は44px。下タブは高さ56pxで作っている）
      if (r.height < 40) 共通.push(`下タブ「${名}」が低すぎる（${Math.round(r.height)}px）`);
    }
  }

  // ⑤ 指で押すには小さすぎる操作（目安は 44px。ここでは「明らかに小さい」32px を下限にする）
  const 小さい = [];
  for (const el of document.querySelectorAll("button, a[href], select, input[type=button], input[type=submit]")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // 文中のリンクは小さくて当然なので見逃す
    if (getComputedStyle(el).display === "inline") continue;
    if (r.height >= 32 && r.width >= 32) continue;
    if (!見えている(el)) continue;
    const 名 = (el.innerText || el.getAttribute("aria-label") || el.tagName).replace(/\s+/g, "").slice(0, 14);
    小さい.push(`「${名}」${Math.round(r.width)}×${Math.round(r.height)}px`);
    if (小さい.length >= 6) break;
  }
  if (小さい.length) 問題.push(`指で押すには小さい: ${小さい.join(" / ")}`);

  // ⑥ 文字が箱からはみ出して黙って切れていないか（… を出している所は意図的なので見逃す）
  const 切れ = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (el.children.length) continue; // 文字を直接持つ要素だけ見る
    const cs = getComputedStyle(el);
    if (cs.overflow === "visible" && cs.overflowX === "visible") continue;
    if (cs.textOverflow === "ellipsis") continue;
    if (el.scrollWidth <= el.clientWidth + 2) continue;
    if (!見えている(el)) continue;
    const t = (el.innerText || "").replace(/\s+/g, "").slice(0, 14);
    if (!t) continue;
    切れ.push(`「${t}」`);
    if (切れ.length >= 6) break;
  }
  if (切れ.length) 問題.push(`文字が切れている: ${切れ.join(" / ")}`);

  return { 共通, 問題 };
}

/** 一番下まで送って、フッターの終わりが下タブバーに隠れていないかを見る。 */
function 一番下を調べる() {
  const 共通 = [];
  const バー = document.querySelector('nav[aria-label="メインメニュー"]');
  const フッター = document.querySelector("footer");
  if (バー && フッター) {
    const b = バー.getBoundingClientRect();
    const f = フッター.getBoundingClientRect();
    // 小数の丸め（端末の拡大率）で 1px 前後ぶれるので、2px までは許す。
    if (f.bottom > b.top + 2) {
      共通.push(
        `ページの一番下が下タブバーに隠れている（フッターの下端 ${Math.round(f.bottom)}px / バーの上端 ${Math.round(b.top)}px）`,
      );
    }
  }
  return 共通;
}

export const T39 = {
  id: "T39",
  title: "スマホ幅（375px）で主要な画面が崩れていない",
  async run({ browser, log }) {
    const guest = await openPersona(browser, { device: "se" });
    const member = await openPersona(browser, { device: "se" });
    try {
      await login(member.page, ACCOUNTS.seller);

      // 詳細ページ用に、一覧の先頭の教科書を1つ調べておく
      await go(member.page, "/listings");
      await wait(1500);
      const 教科書のパス = await member.page.evaluate(() => {
        const a = document.querySelector('a[href^="/listings/"]');
        return a ? new URL(a.href).pathname : null;
      });

      const 落ちる問題 = [];
      const 残り作業 = [];

      for (const s of 画面) {
        const path = s.path === "__listing__" ? 教科書のパス : s.path;
        if (!path) {
          log(`（${s.名前}：一覧に教科書が無いので飛ばした）`);
          continue;
        }
        const page = s.ログイン ? member.page : guest.page;
        await go(page, path);
        await wait(1800); // 読み込みと差し替えが落ち着くのを待つ
        // Next.js 開発サーバーのインジケータはプロダクトのUIではないので隠す（下タブに重なる）。
        await page.addStyleTag({ content: "nextjs-portal{display:none !important}" }).catch(() => {});

        const { 共通, 問題 } = await page.evaluate(画面を調べる, !!s.下タブなし);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await wait(400);
        共通.push(...(await page.evaluate(一番下を調べる)));

        const 明細 = (xs) => xs.map((m) => `    - ${m}`).join("\n");
        // 共通部分（ナビ・下タブバー・フッター）は移行済みなので、崩れたら必ず落とす。
        if (共通.length) {
          落ちる問題.push(`${s.名前}（${path}）の共通部分\n${明細(共通)}`);
          log(`  × ${s.名前}（${path}）共通部分が崩れている`);
        }
        // 画面の中身は、まだ移していない画面なら記録だけにする。
        if (問題.length) {
          if (s.済み) {
            落ちる問題.push(`${s.名前}（${path}）\n${明細(問題)}`);
            log(`  × ${s.名前}（${path}）`);
          } else {
            残り作業.push(`${s.名前}（${path}）\n${明細(問題)}`);
            log(`  △ ${s.名前}（${path}）… 未移行。残り作業として記録`);
          }
        }
        if (!共通.length && !問題.length) log(`  ○ ${s.名前}（${path}）`);
      }

      if (残り作業.length) {
        log("");
        log("── まだ Tailwind に移していない画面で見つかった崩れ（以降のタスクの消化リスト） ──");
        for (const m of 残り作業) log(m);
        log("──────────────────────────────────────────────");
      }

      if (落ちる問題.length) {
        throw new Error("移行済みの画面が崩れています:\n" + 落ちる問題.join("\n"));
      }
      log(`共通部分（ナビ・下タブバー・フッター）と、移行済みの画面 ${画面.filter((s) => s.済み).length} 件はスマホ幅で崩れていない`);
    } finally {
      await guest.context.close().catch(() => {});
      await member.context.close().catch(() => {});
    }
  },
};
