import { formatDateTime, formatSlot, paymentStateLabel, yen } from "@/lib/labels";
import type { PaymentTone } from "@/lib/labels";
import type { CandidateSlot } from "@/lib/types";
import type { AdminReservationRow } from "./types";

// md 以上では表の列、md 未満では縦積みのカード。
// 同じ書き方で両方をまかなえるよう、表そのものではなくグリッドで組んでいる
// （表の要素だと、折り返したときにカードの形にできない）。
const ROW_GRID =
  "md:grid md:grid-cols-[6.5rem_8rem_minmax(0,1fr)_6rem_8rem_8rem_5rem] md:items-center md:gap-3";

const STATUS_TONE: Record<string, string> = {
  申請中: "bg-warn-bg text-warn-ink border-warn-line",
  日程調整中: "bg-info-bg text-info border-info-line",
  承認済み: "bg-info-bg text-info border-info-line",
  完了: "bg-white text-ink-sub border-line",
  キャンセル: "bg-bg-light text-ink-muted border-line-light",
};

const PAYMENT_TONE: Record<PaymentTone, string> = {
  ng: "bg-alert-bg text-alert border-alert-line",
  warn: "bg-warn-bg text-warn-ink border-warn-line",
  ok: "bg-white text-ok-strong border-line",
  none: "bg-bg-light text-ink-muted border-line-light",
};

export default function AdminReservationList({ rows }: { rows: AdminReservationRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-line-light bg-white px-4 py-10 text-center text-sm text-ink-sub">
        あてはまる取引はありません。
      </p>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-line-light bg-white">
      {/* 見出しの行は表のときだけ。カードのときは各項目に名前を添える。 */}
      <div
        className={`hidden border-b border-line-light bg-off-white px-4 py-2 text-xs font-bold text-ink-sub ${ROW_GRID}`}
      >
        <span>状態</span>
        <span>決済</span>
        <span>教科書</span>
        <span className="text-right">金額</span>
        <span>買い手</span>
        <span>出品者</span>
        <span className="text-right">申込</span>
      </div>

      <ul>
        {rows.map((r) => (
          <li key={r.id} className="border-b border-line-light last:border-b-0">
            <Row row={r} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ row }: { row: AdminReservationRow }) {
  const payment = paymentStateLabel(row.paid_at, row.payment_status);

  return (
    // details にしておくと、JavaScript なしで開いたり閉じたりできる。
    <details className="group">
      <summary
        className={`cursor-pointer list-none px-4 py-3 hover:bg-off-white [&::-webkit-details-marker]:hidden ${ROW_GRID}`}
      >
        {/* スマホ：バッジを横に2つ並べる。PC：別々の列になる。 */}
        <span className="flex gap-2 md:contents">
          <Badge className={STATUS_TONE[row.status ?? ""] ?? STATUS_TONE["完了"]}>{row.status}</Badge>
          <Badge className={PAYMENT_TONE[payment.tone]}>
            {payment.alert && <span aria-hidden="true">⚠ </span>}
            {payment.label}
          </Badge>
        </span>

        <span className="mt-2 block truncate font-bold text-navy md:mt-0">
          {row.listing_title}
        </span>

        <span className="mt-1 block text-sm font-bold text-ink md:mt-0 md:text-right">
          {yen(row.price ?? 0)}
        </span>

        <Party label="買い手" name={row.buyer_name} faculty={row.buyer_faculty} />
        <Party label="出品者" name={row.seller_name} faculty={row.seller_faculty} />

        <span className="mt-1 block text-xs text-ink-muted md:mt-0 md:text-right">
          <span className="md:hidden">申込 </span>
          {formatDateTime(row.created_at)}
        </span>
      </summary>

      <Detail row={row} />
    </details>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-xs border px-2 py-0.5 text-xs font-bold ${className}`}
    >
      {children}
    </span>
  );
}

function Party({
  label,
  name,
  faculty,
}: {
  label: string;
  name: string | null;
  faculty: string | null;
}) {
  return (
    <span className="mt-1 block truncate text-sm text-ink-mid md:mt-0">
      <span className="text-xs text-ink-muted md:hidden">{label} </span>
      {name ?? "（名前なし）"}
      {faculty && <span className="ml-1 text-xs text-ink-muted">{faculty}</span>}
    </span>
  );
}

/**
 * 行を開いたときの中身。問い合わせの調査に要るものだけを並べる。
 * メールアドレス・メッセージ本文・カード情報・決済IDは view に載せていない。
 */
function Detail({ row }: { row: AdminReservationRow }) {
  const slots = (row.candidate_slots ?? null) as CandidateSlot[] | null;
  const chosen =
    slots && typeof row.selected_slot === "number" ? slots[row.selected_slot] : null;

  return (
    <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-line-light bg-off-white px-4 py-4 text-sm md:grid-cols-[8rem_minmax(0,1fr)_8rem_minmax(0,1fr)]">
      <Field label="受け渡し">
        {chosen
          ? `${formatSlot(chosen.date, chosen.time)}（確定）`
          : row.proposed_date
            ? `${formatSlot(row.proposed_date, row.proposed_time ?? "")} ${row.proposed_location ?? ""}（出品者の逆提案）`
            : `${formatSlot(row.preferred_date ?? "", row.preferred_time ?? "")} ${row.preferred_location ?? ""}（希望）`}
      </Field>

      <Field label="候補日程">
        {slots && slots.length > 0
          ? slots.map((s, i) => (
              <span key={i} className="mr-2 inline-block">
                {formatSlot(s.date, s.time)}
                {row.selected_slot === i && " ←確定"}
              </span>
            ))
          : "（なし）"}
      </Field>

      <Field label="出品の状態">{row.listing_status}</Field>
      <Field label="決済会社">{row.payment_provider ?? "（未決済）"}</Field>
      <Field label="決済日時">{formatDateTime(row.paid_at) || "（未決済）"}</Field>
      <Field label="拒否コード">{row.payment_error_code ?? "（なし）"}</Field>
      <Field label="取引ID">
        <code className="font-en text-xs text-ink-sub">{row.id}</code>
      </Field>
      <Field label="出品ID">
        <code className="font-en text-xs text-ink-sub">{row.listing_id}</code>
      </Field>
    </dl>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs font-bold text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink-mid">{children}</dd>
    </>
  );
}
