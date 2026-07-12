"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchSentReservations } from "@/lib/reservations";
import { hasRegisteredCard } from "@/lib/payments";
import { yen } from "@/lib/labels";
import PaymentForm from "@/components/PaymentForm";
import PaymentQR from "@/components/PaymentQR";
import type { Reservation } from "@/lib/types";

// 買い手の受け渡し・支払い画面（PB-036 Phase 1）。
//  1. 承認済みの購入希望を開く
//  2. 支払いカード未登録なら登録（PAY.jp Customer 作成）
//  3. 受け渡し用QRを表示 → 出品者がスキャンすると保存済みカードへ課金
export default function CheckoutPage() {
  const params = useParams<{ reservationId: string }>();
  const { user, ready } = useAuth();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [cardReady, setCardReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshCard = useCallback(async () => {
    setCardReady(await hasRegisteredCard());
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    (async () => {
      const [list, card] = await Promise.all([
        fetchSentReservations(user.id),
        hasRegisteredCard(),
      ]);
      if (cancelled) return;
      setReservation(list.find((r) => r.id === params.reservationId) ?? null);
      setCardReady(card);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, user, params.reservationId]);

  const wrap = (children: React.ReactNode) => (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: "0 16px" }}>{children}</main>
  );

  if (ready && !user) return wrap(<p>決済にはログインが必要です。</p>);
  if (loading) return wrap(<p>読み込み中…</p>);
  if (!reservation) return wrap(<p>対象の購入希望が見つかりません。</p>);

  const paid = !!reservation.charge_id || reservation.status === "完了";

  return wrap(
    <>
      <p style={{ marginBottom: 4, color: "var(--text-muted)" }}>{reservation.listing_title}</p>
      <p style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>{yen(reservation.price)}</p>

      {paid ? (
        <div className="form-card">
          <h2>決済が完了しています</h2>
          <p className="form-hint">受け取りは完了です。ありがとうございました。</p>
          <Link href="/mypage" className="btn-navy btn-full" style={{ marginTop: 12 }}>
            マイページへ
          </Link>
        </div>
      ) : reservation.status !== "承認済み" ? (
        <div className="form-card">
          <h2>出品者の承認待ちです</h2>
          <p className="form-hint">
            出品者が受け渡し日を承認すると、支払いに進めます。マイページでご確認ください。
          </p>
        </div>
      ) : cardReady ? (
        <div className="form-card">
          <h2>受け渡し用QR</h2>
          <PaymentQR reservationId={reservation.id} onNeedCard={() => setCardReady(false)} />
        </div>
      ) : (
        <PaymentForm
          onRegistered={refreshCard}
          submitLabel="カードを登録してQRを表示"
          defaultEmail={user?.email ?? ""}
        />
      )}
    </>,
  );
}
