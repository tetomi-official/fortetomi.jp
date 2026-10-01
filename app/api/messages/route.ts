import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifyNewMessage } from "@/lib/notify-message";

// ===================================================
// メッセージの送信（#59）
// ---------------------------------------------------
// もとはブラウザから Supabase に直接 insert していた。それだと相手に知らせる
// 場所がどこにも無いので、/api/reservations と同じ形にした：
// **書き込みとメール送信を1回のリクエストの中でやる。**
//
// 使う鍵は anon キー＋本人の Cookie。service role は使わない。
// だから RLS（当事者だけ・なりすまし禁止）がそのまま効く。そのうえで、
// 断り方を分かりやすくするため当事者かどうかをここでも確かめている。
//
// メールは after() に載せる。画面には先に返事を返し、送信はそのあと必ず走る。
// ===================================================

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LENGTH = 2000;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  // 連投そのものは止めないが、機械的な大量送信は止める（60回/10分）。
  const rl = await checkRateLimit(`message:${user.id}`, 60, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "メッセージの送信が多すぎます。しばらくしてからお試しください。" },
      { status: 429 },
    );
  }

  const json = (await req.json().catch(() => null)) as {
    reservationId?: unknown;
    body?: unknown;
  } | null;
  const reservationId = typeof json?.reservationId === "string" ? json.reservationId : "";
  const body = typeof json?.body === "string" ? json.body.trim() : "";

  if (!UUID_RE.test(reservationId)) {
    return NextResponse.json({ error: "対象の取引が見つかりません" }, { status: 404 });
  }
  if (!body) {
    return NextResponse.json({ error: "メッセージが空です" }, { status: 400 });
  }
  if (body.length > MAX_LENGTH) {
    return NextResponse.json(
      { error: `メッセージは${MAX_LENGTH}文字までです` },
      { status: 400 },
    );
  }

  // 当事者かどうか。RLS により、当事者でない人はこの取引を読めない＝ここで止まる。
  const { data: reservation } = await supabase
    .from("reservations")
    .select("id, buyer_id, seller_id")
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation) {
    return NextResponse.json({ error: "対象の取引が見つかりません" }, { status: 404 });
  }
  if (reservation.buyer_id !== user.id && reservation.seller_id !== user.id) {
    return NextResponse.json({ error: "この取引のメッセージは送れません" }, { status: 403 });
  }

  // sender_id は本人で固定（なりすまし防止。RLS の with check も同じ条件で二重に見る）。
  const { data, error } = await supabase
    .from("messages")
    .insert({ reservation_id: reservationId, sender_id: user.id, body })
    .select("*")
    .single();
  if (error) {
    console.error("sendMessage failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  after(() => notifyNewMessage({ reservationId, senderId: user.id }));
  return NextResponse.json({ message: data });
}
