import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { canTransition } from "@/lib/reservation-flow";
import { notifyReservationEvent, type ReservationEvent } from "@/lib/notify-reservation";
import type { CandidateSlot, ReservationStatus } from "@/lib/types";

// ===================================================
// 購入希望の作成と更新
// ---------------------------------------------------
// もともとブラウザから Supabase を直接叩いていたものを、サーバー経由に変えた。
// 目的は通知の取りこぼしを無くすこと：**書き込みとメール送信を同じリクエストに
// 入れる**ことで、「書き込めたのにメールだけ飛ばない」が起きなくなる。
//
// 安全性の作りは変えていない。ここで使う Supabase クライアントは
// anon キー＋本人の Cookie で動くので、RLS も列レベル権限も、
// migration-15 のステータス遷移トリガーも、ブラウザから叩いたときと同じに効く。
// サーバーだからといって強い権限で書き込んでいるわけではない。
//
// メール送信は after() に載せる。応答を先に返して画面を待たせず、それでいて
// 送信は必ず実行される（実行環境が after の完了まで関数を生かす）。
// ===================================================

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SLOTS = 3;

const STATUSES: ReservationStatus[] = ["申請中", "日程調整中", "承認済み", "完了", "キャンセル"];

/** 受け渡し候補の形を検かめる（日付と時刻の文字列が入っているか）。 */
function 候補として正しい(v: unknown): v is CandidateSlot[] {
  return (
    Array.isArray(v) &&
    v.length >= 1 &&
    v.length <= MAX_SLOTS &&
    v.every(
      (s) =>
        !!s &&
        typeof s === "object" &&
        typeof (s as CandidateSlot).date === "string" &&
        (s as CandidateSlot).date.length > 0 &&
        typeof (s as CandidateSlot).time === "string" &&
        (s as CandidateSlot).time.length > 0,
    )
  );
}

/** 購入希望を作る（買い手）。 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const rl = await checkRateLimit(`reservation:${user.id}`, 30, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "操作が多すぎます。しばらくしてからお試しください。" },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    listingId?: unknown;
    sellerId?: unknown;
    price?: unknown;
    slots?: unknown;
    preferredLocation?: unknown;
    message?: unknown;
  } | null;

  const listingId = typeof body?.listingId === "string" ? body.listingId : "";
  const sellerId = typeof body?.sellerId === "string" ? body.sellerId : "";
  const price = typeof body?.price === "number" ? body.price : NaN;
  const location = typeof body?.preferredLocation === "string" ? body.preferredLocation.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!UUID_RE.test(listingId) || !UUID_RE.test(sellerId)) {
    return NextResponse.json({ error: "対象の教科書が見つかりません" }, { status: 404 });
  }
  if (!Number.isInteger(price) || price < 0) {
    return NextResponse.json({ error: "価格が不正です" }, { status: 400 });
  }
  if (!候補として正しい(body?.slots)) {
    return NextResponse.json(
      { error: `受け渡し候補は1〜${MAX_SLOTS}件で、日付と時刻が必要です` },
      { status: 400 },
    );
  }
  if (!location) {
    return NextResponse.json({ error: "受け渡し場所を入力してください" }, { status: 400 });
  }
  if (sellerId === user.id) {
    return NextResponse.json({ error: "自分の出品には購入希望を送れません" }, { status: 400 });
  }

  const slots = body.slots;
  const [first] = slots;

  // buyer_id はクライアントの申告ではなくログイン中の本人を使う。
  // listing_id / seller_id / price の整合は DB のトリガーが出品と突き合わせて検査する。
  const { data, error } = await supabase
    .from("reservations")
    .insert({
      listing_id: listingId,
      buyer_id: user.id,
      seller_id: sellerId,
      price,
      // preferred_date/time は NOT NULL のため第1希望を入れて互換を保つ。
      preferred_date: first.date,
      preferred_time: first.time,
      preferred_location: location,
      candidate_slots: slots,
      message: message || null,
    })
    .select("id");
  if (error) {
    console.error("createReservation failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const created = (data as { id: string }[] | null)?.[0];
  if (created) {
    after(() =>
      notifyReservationEvent({ reservationId: created.id, event: "created", actor: "buyer" }),
    );
  }
  return NextResponse.json({ id: created?.id ?? null });
}

/** 購入希望を更新する（承認・日程の確定・逆提案・取りやめ）。 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const rl = await checkRateLimit(`reservation:${user.id}`, 30, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "操作が多すぎます。しばらくしてからお試しください。" },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    id?: unknown;
    status?: unknown;
    selectedSlot?: unknown;
    proposed?: unknown;
  } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "対象の購入希望が見つかりません" }, { status: 404 });
  }

  // 当事者かどうかと、いまの状態を見る。RLS により当事者の行しか読めない。
  const { data: current } = await supabase
    .from("reservations")
    .select("id, buyer_id, seller_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!current) {
    return NextResponse.json({ error: "対象の購入希望が見つかりません" }, { status: 404 });
  }
  const actor: "buyer" | "seller" | null =
    current.buyer_id === user.id ? "buyer" : current.seller_id === user.id ? "seller" : null;
  if (!actor) {
    return NextResponse.json({ error: "この操作を行う権限がありません" }, { status: 403 });
  }

  // --- 何をするのかを決める ---
  let patch: Record<string, unknown>;
  let event: ReservationEvent | null;
  let 次のステータス: ReservationStatus;

  if (typeof body?.selectedSlot === "number") {
    // 候補を選んで確定（出品者）。
    if (!Number.isInteger(body.selectedSlot) || body.selectedSlot < 0 || body.selectedSlot >= MAX_SLOTS) {
      return NextResponse.json({ error: "選んだ候補が不正です" }, { status: 400 });
    }
    次のステータス = "承認済み";
    patch = { selected_slot: body.selectedSlot, status: 次のステータス };
    event = "approved";
  } else if (body?.proposed && typeof body.proposed === "object") {
    // 別日程の逆提案（出品者）。
    const p = body.proposed as { date?: unknown; time?: unknown; location?: unknown };
    const date = typeof p.date === "string" ? p.date.trim() : "";
    const time = typeof p.time === "string" ? p.time.trim() : "";
    const loc = typeof p.location === "string" ? p.location.trim() : "";
    if (!date || !time || !loc) {
      return NextResponse.json({ error: "日付・時間帯・場所をすべて入力してください" }, { status: 400 });
    }
    次のステータス = "日程調整中";
    patch = { proposed_date: date, proposed_time: time, proposed_location: loc, status: 次のステータス };
    event = "rescheduled";
  } else if (STATUSES.includes(body?.status as ReservationStatus)) {
    次のステータス = body!.status as ReservationStatus;
    patch = { status: 次のステータス };
    event = 次のステータス === "承認済み" ? "approved" : 次のステータス === "キャンセル" ? "cancelled" : null;
  } else {
    return NextResponse.json({ error: "更新の内容が不正です" }, { status: 400 });
  }

  // 画面側と同じ遷移表で先に弾く。DB のトリガーが最後の砦だが、そこまで行くと
  // 英語の例外文がそのまま返ってしまうため、ここで日本語にして返す。
  const 現在 = current.status as ReservationStatus;
  if (!canTransition(現在, 次のステータス, actor)) {
    return NextResponse.json(
      { error: `いまの状態（${現在}）からは「${次のステータス}」にできません` },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("reservations").update(patch).eq("id", id);
  if (error) {
    console.error("updateReservation failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (event) {
    const ev = event;
    after(() => notifyReservationEvent({ reservationId: id, event: ev, actor }));
  }
  return NextResponse.json({ ok: true });
}
