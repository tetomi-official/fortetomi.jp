// ===================================================
// テスト用の受信箱。
//
// 開発サーバーを MAIL_CAPTURE_DIR 付きで動かすと、送るはずだったメールが
// 1通1ファイルの JSON で書き出される（lib/mail.ts）。ここではそれを読む。
// 通知は応答を返したあとに送られる（after()）ので、届くまで少し待つ。
// ===================================================

import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { wait } from "./helpers.mjs";

function 置き場() {
  const dir = process.env.MAIL_CAPTURE_DIR?.trim();
  if (!dir) {
    throw new Error(
      "MAIL_CAPTURE_DIR が設定されていません。\n" +
        "  .env.development.local に MAIL_CAPTURE_DIR=tests/e2e/artifacts/mail を書き、開発サーバーを再起動してください。",
    );
  }
  return path.resolve(dir);
}

/** 受信箱を空にする。 */
export async function 受信箱を空にする() {
  await rm(置き場(), { recursive: true, force: true });
}

/** 今ある全部のメール（古い順）。本文はタグを外した文字も付ける。 */
export async function 全部のメール() {
  const dir = 置き場();
  let names = [];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const list = [];
  for (const n of names) {
    const m = JSON.parse(await readFile(path.join(dir, n), "utf8"));
    m.text = m.html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    list.push(m);
  }
  return list;
}

/**
 * 条件に合うメールが届くまで待って返す。
 * @param 条件 { to, 件名 }（件名は正規表現）
 */
export async function メールを待つ({ to, 件名 }, { timeout = 15000 } = {}) {
  const limit = Date.now() + timeout;
  for (;;) {
    const 合う = (await 全部のメール()).filter((m) => m.to === to && 件名.test(m.subject));
    if (合う.length) return 合う.at(-1);
    if (Date.now() > limit) {
      const 届いた = (await 全部のメール()).map((m) => `    ${m.to}「${m.subject}」`).join("\n");
      throw new Error(
        `メールが届きません: ${to} 宛て・件名 ${件名}\n  届いていたもの:\n${届いた || "    （なし）"}`,
      );
    }
    await wait(500);
  }
}
