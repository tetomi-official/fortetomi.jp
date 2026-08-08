// ===================================================
// 決済会社の共通インターフェース
// ---------------------------------------------------
// 決済会社ごとに本当に違うのは「カードの保存」と「課金」の2つだけ。
// 認証・レート制限・受け渡しQRのnonce・予約や出品への書き込みは決済会社に
// 依存しないので、APIルート側に残す（このインターフェースには載せない）。
//
// Connect（出品者の口座登録）と Webhook の署名検証もここには載せない。
//  - Connect は Stripe 固有で、PAY.jp 側に意味のない空実装を強いるだけになる。
//  - Webhook は PAY.jp が固定トークンのヘッダ照合、Stripe が生ボディのHMAC署名で、
//    共通化できる部分がない。ルートを分け、DB書き込み（reconcile.ts）でだけ合流させる。
// ===================================================

import type { ProviderName } from "./config";

export type { ProviderName };

/** payment_customers の1行を、決済会社に依存しない形で表したもの。 */
export interface StoredCustomer {
  userId: string;
  payjpCustomerId: string | null;
  stripeCustomerId: string | null;
  stripePaymentMethodId: string | null;
}

export type ProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

/** クライアントのカード登録フォームが作った成果物。register-card に届く。 */
export type RegisterCardPayload =
  | { provider: "payjp"; token: string }
  | { provider: "stripe"; setupIntentId: string };

/** payment_customers に保存すべきID。決済会社が返し、ルートが書き込む。 */
export interface RegisteredCardIds {
  payjpCustomerId?: string;
  stripeCustomerId?: string;
  stripePaymentMethodId?: string;
}

/** クライアントのカード入力欄を出す前に必要な準備。PAY.jp は不要。 */
export type CardSetupSession =
  | { kind: "none" }
  | { kind: "stripe_setup_intent"; clientSecret: string; customerId: string };

export interface ChargeInput {
  reservationId: string;
  /** reservations.price をサーバーで読み直した金額。クライアント値は使わない。 */
  amountJpy: number;
  buyerUserId: string;
  sellerUserId: string;
  customer: StoredCustomer;
  /** Stripe Connect の連結アカウント（acct_）。PAY.jp では null。 */
  sellerAccountId: string | null;
  /** プラットフォーム手数料（円）。PAY.jp では 0。 */
  applicationFeeJpy: number;
  /** 同じQRの二度読みで二重課金しないための冪等キー。 */
  idempotencyKey: string;
  /** `reservation:<uuid>`。Webhook が予約を特定するのに使う。 */
  description: string;
  metadata: Record<string, string>;
}

/**
 * 課金の結果。charge() は例外を投げず、必ずこのいずれかを返す。
 *  - requires_action: カード会社が本人認証(3DS)を要求した。買い手はその場にいるので復旧できる。
 *  - declined:        カード会社が拒否した（残高不足・不正検知など）。
 *  - error:           通信失敗や設定不備。httpStatus をそのままルートが返す。
 */
export type ChargeOutcome =
  | { kind: "succeeded"; chargeId: string; paymentIntentId: string | null }
  | { kind: "requires_action"; paymentIntentId: string }
  | { kind: "declined"; code: string; message: string }
  | { kind: "error"; message: string; httpStatus: number };

export interface PaymentProvider {
  readonly name: ProviderName;
  /** この決済会社が受け付ける最低額（円）。 */
  readonly minimumAmountJpy: number;
  /** 出品者ごとの口座登録（Connect）が要るか。 */
  readonly requiresSellerOnboarding: boolean;

  /** カード入力欄を出す前の準備。PAY.jp は { kind: "none" }。 */
  createCardSetupSession(input: {
    userId: string;
    userEmail: string | null;
    existing: StoredCustomer | null;
  }): Promise<ProviderResult<CardSetupSession>>;

  /** クライアントの成果物をサーバー側で検証し、保存すべきIDを返す。 */
  registerCard(input: {
    userId: string;
    userEmail: string | null;
    existing: StoredCustomer | null;
    payload: RegisterCardPayload;
  }): Promise<ProviderResult<RegisteredCardIds>>;

  /**
   * 「今の決済会社で課金できるカード」が保存されているか。
   * provider 列ではなく ID の有無で判定する。こうしておくと決済会社を
   * どちら向きに切り替えても、判定が壊れない。
   */
  hasUsableCard(customer: StoredCustomer | null): boolean;

  /** 買い手不在（オフセッション）での課金。 */
  charge(input: ChargeInput): Promise<ChargeOutcome>;
}
