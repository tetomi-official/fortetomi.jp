"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PaymentForm from "@/components/PaymentForm";
import { DataRow, RowGroup, SectionLabel } from "@/components/ListRow";
import { PAYMENT_TIMING_NOTICE } from "@/lib/constants";
import { cardBrandLabel, cardExpiryLabel, isCardExpired } from "@/lib/labels";
import { deleteRegisteredCard, fetchPaymentMethod, type CardSummary } from "@/lib/payments";

// マイページ「お支払い方法」（#53）。
//
// これまでカードを登録できるのは受け渡し直前の決済画面だけで、一度登録すると
// 変更も削除もできなかった（期限切れ・紛失時に詰む）。ここで一通りできるようにする。
//
// 登録・差し替えの中身は決済画面と同じ PaymentForm をそのまま使う。カード番号は
// 決済会社のフォーム（iframe）の中だけにあり、この画面には渡ってこない。
//
// 見た目は案2の行（ListRow.tsx）。md 以上ではマイページの他のタブと並ぶので、
// 全体をカードの枠に入れる。

/** 画面の状態。form は登録・差し替えのフォームを開いているとき。 */
type Mode = "view" | "form";

export default function PaymentMethodPanel() {
  const searchParams = useSearchParams();
  const [card, setCard] = useState<CardSummary | null>(null);
  const [pendingHandovers, setPendingHandovers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 3Dセキュアでカード会社のページへ飛ばされ、ここへ戻ってきた場合（URLに setup_intent が
  // 付いている）は、最初からフォームを開く。開かないと PaymentForm が動かず、
  // 認証まで済んだ登録が宙に浮く。
  const [mode, setMode] = useState<Mode>(() =>
    searchParams.has("setup_intent") ? "form" : "view",
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const result = await fetchPaymentMethod();
    setCard(result.card);
    setPendingHandovers(result.pendingHandovers);
    setError(result.error);
    setLoading(false);
  }, []);

  // effect の中から直接 setState する関数を呼ばず、取得そのものは外に出した関数に任せ、
  // その .then() の中で state を書く（PaymentFormStripe と同じ理由。react-hooks の
  // set-state-in-effect に引っかかるため）。
  useEffect(() => {
    fetchPaymentMethod().then((result) => {
      setCard(result.card);
      setPendingHandovers(result.pendingHandovers);
      setError(result.error);
      setLoading(false);
    });
  }, []);

  /** 登録・差し替えのフォームを開く。前回の知らせは消す（古い成功文言を残さない）。 */
  const openForm = () => {
    setNotice(null);
    setError(null);
    setMode("form");
  };

  const onRegistered = useCallback(async () => {
    setMode("view");
    // 何が起きたかをそのまま言う。差し替えたのに「登録しました」と出ると、
    // 前のカードが残っているのか分からない。
    setNotice(card ? "カードを変更しました" : "カードを登録しました");
    setLoading(true);
    await reload();
  }, [card, reload]);

  const onDelete = async () => {
    setDeleting(true);
    setNotice(null);
    const { error: 失敗 } = await deleteRegisteredCard();
    setDeleting(false);
    setConfirmDelete(false);
    if (失敗) {
      setError(失敗);
      return;
    }
    setNotice("カードを削除しました");
    setLoading(true);
    await reload();
  };

  // 受け渡し待ちの取引があるうちは削除させない。カードが無いと受け渡しQRが出ず、
  // 待ち合わせ場所で支払えなくなるため（サーバー側でも同じ条件で断っている）。
  const 削除できない = pendingHandovers > 0;
  const 期限切れ = !!card && isCardExpired(card.expMonth, card.expYear);

  return (
    <section className="md:mb-5 md:overflow-hidden md:rounded-xl md:border md:border-line-light md:bg-white md:shadow-sm">
      <div className="hidden md:flex md:items-center md:justify-between md:border-b md:border-line-light md:bg-bg-light md:px-6 md:py-[18px]">
        <h3 className="text-[13px] font-black tracking-[0.08em] text-navy">お支払い方法</h3>
      </div>

      <div className="md:p-6">
        {/* スマホには画面名の帯が無いので、ここで何の画面かを示す（md 以上は上の見出しが担う）。 */}
        <SectionLabel className="pt-0 md:hidden">お支払い方法</SectionLabel>

        {notice && (
          <p className="mx-4 mb-3 rounded-lg bg-ok/10 px-3 py-2 text-sm text-navy md:mx-0">
            {notice}
          </p>
        )}
        {error && (
          <p className="mx-4 mb-3 rounded-lg bg-ng/10 px-3 py-2 text-sm text-ng-ink md:mx-0">
            {error}
          </p>
        )}

        {loading ? (
          <p className="px-4 py-6 text-sm text-ink-sub md:px-0">読み込み中…</p>
        ) : mode === "form" ? (
          <>
            <p className="px-4 pb-3 text-[13px] leading-relaxed text-ink-sub md:px-0">
              <i className="fas fa-circle-info" aria-hidden="true" /> {PAYMENT_TIMING_NOTICE}
            </p>
            <PaymentForm
              onRegistered={onRegistered}
              submitLabel={card ? "このカードに変更する" : "カードを登録する"}
            />
            <div className="px-4 md:px-0">
              <button
                type="button"
                className="min-h-11 text-sm font-bold text-navy"
                onClick={() => setMode("view")}
              >
                キャンセル
              </button>
            </div>
          </>
        ) : card ? (
          <>
            <RowGroup>
              <DataRow
                label="カード"
                value={`${cardBrandLabel(card.brand)} •••• ${card.last4}`}
              />
              <DataRow
                label="有効期限"
                value={
                  <span className={期限切れ ? "text-ng-ink" : undefined}>
                    {cardExpiryLabel(card.expMonth, card.expYear) || "不明"}
                    {期限切れ ? "（期限切れ）" : ""}
                  </span>
                }
              />
            </RowGroup>

            <p className="px-4 pt-3 text-[13px] leading-relaxed text-ink-sub md:px-0">
              {期限切れ
                ? "有効期限が切れています。受け渡しの前にカードを変更してください。"
                : PAYMENT_TIMING_NOTICE}
            </p>

            <div className="flex flex-col gap-3 px-4 pt-4 md:flex-row md:px-0">
              <button
                type="button"
                className="btn-navy btn-full md:w-auto"
                onClick={openForm}
              >
                <i className="fas fa-credit-card" aria-hidden="true" /> カードを変更する
              </button>
              <button
                type="button"
                className="btn-outline btn-full disabled:cursor-not-allowed disabled:opacity-40 md:w-auto"
                disabled={削除できない}
                onClick={() => setConfirmDelete(true)}
              >
                <i className="fas fa-trash" aria-hidden="true" /> カードを削除する
              </button>
            </div>
            {削除できない && (
              <p className="px-4 pt-3 text-[13px] leading-relaxed text-ink-sub md:px-0">
                受け渡し待ちの取引が{pendingHandovers}件あるため、いまは削除できません。
                受け渡しを済ませるか、取引をキャンセルすると削除できます。
              </p>
            )}
          </>
        ) : (
          <>
            <div className="border-y border-line-light bg-white px-4 py-6 md:border-0 md:px-0 md:py-0">
              <h4 className="text-base font-extrabold text-navy">カードは未登録です</h4>
              <p className="mt-2 text-sm leading-relaxed text-ink-sub">
                受け渡しの場でQRを読み取ってもらうには、カードの登録が必要です。
                {PAYMENT_TIMING_NOTICE}
              </p>
            </div>
            <div className="px-4 pt-4 md:px-0">
              <button
                type="button"
                className="btn-navy btn-full md:w-auto"
                onClick={openForm}
              >
                <i className="fas fa-credit-card" aria-hidden="true" /> カードを登録する
              </button>
            </div>
          </>
        )}
      </div>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">
              <i className="fas fa-trash" />
            </div>
            <h3 className="modal-title">カードを削除しますか？</h3>
            <p className="modal-text">
              削除すると、受け渡しの場で支払えなくなります。次に購入するときは、
              もう一度カードを登録してください。
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-outline"
                onClick={() => setConfirmDelete(false)}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="btn-navy disabled:opacity-60"
                disabled={deleting}
                onClick={onDelete}
              >
                {deleting ? "削除中…" : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
