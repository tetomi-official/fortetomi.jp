"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeSvgWriter } from "@zxing/browser";
import { encodePaymentQR, requestPaymentNonce } from "@/lib/payments";

// 受け渡し用QR表示（買い手）。PB-036 Phase 1。
// サーバーからワンタイム nonce を取得し、reservationId とともにQRへエンコードして表示する。
// 出品者がこのQRを読み取ると、買い手の保存済みカードへ課金される。
export default function PaymentQR({
  reservationId,
  onNeedCard,
}: {
  reservationId: string;
  onNeedCard?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<string | null>(null);

  // nonce を取得して state に反映する。effect からは非同期（.then）で呼ぶため同期 setState にならない。
  function apply(res: Awaited<ReturnType<typeof requestPaymentNonce>>) {
    setLoading(false);
    if (res.error || !res.nonce) {
      setError(res.error);
      if (res.needsCard) onNeedCard?.();
      return;
    }
    setError(null);
    setNonce(res.nonce);
  }

  useEffect(() => {
    let cancelled = false;
    requestPaymentNonce(reservationId).then((res) => {
      if (!cancelled) apply(res);
    });
    return () => {
      cancelled = true;
    };
    // onNeedCard はマウント時の参照で十分。reservationId 変化時のみ再発行する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId]);

  // 再試行（イベントハンドラなので同期 setState 可）。
  const retry = () => {
    setLoading(true);
    setError(null);
    setNonce(null);
    requestPaymentNonce(reservationId).then(apply);
  };

  // nonce が用意できたらQRを描画する。描画失敗はログのみ（正常入力ではまず起きない）。
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !nonce) return;
    box.innerHTML = "";
    try {
      new BrowserQRCodeSvgWriter().writeToDom(
        box,
        encodePaymentQR(reservationId, nonce),
        220,
        220,
      );
    } catch (e) {
      console.error("QR render failed:", e);
    }
  }, [nonce, reservationId]);

  return (
    <div style={{ textAlign: "center" }}>
      {loading && <p className="form-hint">QRを準備しています…</p>}
      {error && (
        <div>
          <p style={{ color: "#c0392b", fontSize: 14 }}>{error}</p>
          <button className="btn-outline" onClick={retry} style={{ marginTop: 8 }}>
            <i className="fas fa-rotate-right" /> 再試行
          </button>
        </div>
      )}
      {!loading && !error && nonce && (
        <>
          <div
            ref={boxRef}
            style={{
              display: "inline-block",
              background: "#fff",
              padding: 12,
              borderRadius: 12,
              border: "1px solid var(--border, #e5e7eb)",
            }}
          />
          <p className="form-hint" style={{ marginTop: 10 }}>
            受け渡し時に、このQRを出品者に見せてください。読み取られると決済が完了します。
          </p>
        </>
      )}
    </div>
  );
}
