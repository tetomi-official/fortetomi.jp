import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendHandoverReminders } from "@/lib/notify-handover-reminder";
import type { ReminderKind } from "@/lib/types";

// ===================================================
// 受け渡しリマインドの定時実行の受け口（#58）
// ---------------------------------------------------
// .github/workflows/handover-reminder.yml が日に2回、どの回かを添えてここを叩く。
//   kind=2日前 … 受け渡しの2日前の朝（日本時間 8:00）
//   kind=前日   … 受け渡しの前日の夜（日本時間 20:00）
//
// 誰でも叩けると、いくらでもメールを出させられる（送信の枠を使い切らせる嫌がらせ）。
// Authorization: Bearer <CRON_SECRET> を必ず確かめる。CRON_SECRET が未設定の環境では
// 動かさない（設定漏れで無防備に開くより、動かない方が安全）。
//
// どの回かは呼ぶ側が渡す。サーバーの時計から当てると、実行が遅れたときに
// 違う回として走ってしまう（GitHub Actions の定時実行はよく数十分ずれる）。
// ===================================================

export const runtime = "nodejs";
// 定時実行のたびに DB を見る。キャッシュされた応答を返されては困る。
export const dynamic = "force-dynamic";

const KINDS: ReminderKind[] = ["2日前", "前日"];

/** タイミング攻撃を避けた定数時間比較。長さが違えば即 false。 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function 認証済み(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return !!m && safeEqual(m[1], secret);
}

/**
 * どの回かを読む。POST の本文（JSON）を先に見て、無ければ URL の ?kind= を見る。
 *
 * 回の名前は「2日前」「前日」と日本語なので、本文に入れれば URL の文字化けを
 * 気にしなくてよい。?kind= は手で動かして確かめるとき用。
 */
async function 回を読む(req: Request): Promise<ReminderKind | null> {
  const body = (await req.json().catch(() => null)) as { kind?: unknown } | null;
  const value =
    typeof body?.kind === "string" ? body.kind : new URL(req.url).searchParams.get("kind");
  return KINDS.includes(value as ReminderKind) ? (value as ReminderKind) : null;
}

async function handle(req: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron] CRON_SECRET が未設定です。リマインドは動きません。");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }
  if (!認証済み(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const kind = await 回を読む(req);
  if (!kind) {
    return NextResponse.json(
      { error: `kind は ${KINDS.join(" か ")} を指定してください` },
      { status: 400 },
    );
  }

  const result = await sendHandoverReminders(kind);
  return NextResponse.json(result);
}

// 定時実行は POST で叩く（メールを出す＝副作用があるため）。
// GET も同じ認証で通す。手で動かして中身を確かめたいときに使う。
export const POST = handle;
export const GET = handle;
