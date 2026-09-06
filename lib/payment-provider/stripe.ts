// ===================================================
// Stripe 実装
// ---------------------------------------------------
// 対面のQR受け渡し時、買い手は端末を操作していない（オフセッション課金）。
// そのため 3DS は「カード登録の瞬間」にサーバー側で要求する
// （SetupIntent の payment_method_options.card.request_three_d_secure）。
// 以後はその保存済みカードへ、買い手不在のまま課金する。
//
// 3DS の再検証は「クライアントの申告を信じない」PAY.jp 実装と同じ考え方で、
// サーバーが Stripe から SetupIntent を retrieve() し、status が succeeded で
// あることそのものを根拠にする（succeeded は 3DS 要件を満たさない限り遷移しない）。
//
// 出品者への送金（destination charge の transfer_data.destination）は
// Connect のセットアップ（S3）が前提。sellerAccountId が無いまま charge() を
// 呼ばれた場合はエラーを返す（S3/S4 実装前に stripe に切り替えても暴走しない）。
// ===================================================

import Stripe from "stripe";
import { getStripeClient } from "./stripe-client";
import { declineMessage } from "./errors";
import type {
  CardSetupSession,
  ChargeInput,
  ChargeOutcome,
  PaymentProvider,
  ProviderResult,
  RegisterCardPayload,
  RegisteredCardIds,
  StoredCustomer,
} from "./types";

function classifyChargeError(err: unknown): ChargeOutcome {
  if (err instanceof Stripe.errors.StripeError) {
    const withIntent = err as Stripe.errors.StripeCardError & {
      payment_intent?: Stripe.PaymentIntent;
    };
    // オフセッション課金がカード会社の本人認証を要求した場合。
    // 買い手はその場にいるので復旧できる（S6 で対応する）。
    if (withIntent.code === "authentication_required" && withIntent.payment_intent?.id) {
      return { kind: "requires_action", paymentIntentId: withIntent.payment_intent.id };
    }
    if (err.type === "StripeCardError") {
      const code = withIntent.decline_code ?? withIntent.code ?? "";
      return { kind: "declined", code, message: declineMessage(code) };
    }
  }
  return { kind: "error", message: "決済の通信に失敗しました", httpStatus: 502 };
}

export function createStripeProvider(secretKey: string): PaymentProvider {
  const stripe = getStripeClient(secretKey);
  // 日本のクレジットカード・セキュリティガイドライン該当時は、この値に関係なく
  // Stripe が自動で3DSを要求する。これは「こちら側からも明示的に要求するか」だけを制御する。
  const requestThreeDSecure = process.env.STRIPE_3DS_REQUIRED !== "false";

  return {
    name: "stripe",
    minimumAmountJpy: 50,
    requiresSellerOnboarding: true,

    async createCardSetupSession({
      userId,
      userEmail,
      existing,
    }: {
      userId: string;
      userEmail: string | null;
      existing: StoredCustomer | null;
    }): Promise<ProviderResult<CardSetupSession>> {
      try {
        let customerId = existing?.stripeCustomerId ?? null;
        if (!customerId) {
          const customer = await stripe.customers.create(
            { email: userEmail ?? undefined, metadata: { user_id: userId } },
            { idempotencyKey: `stripe:customer:create:${userId}` },
          );
          customerId = customer.id;
        }

        const setupIntent = await stripe.setupIntents.create({
          customer: customerId,
          payment_method_types: ["card"],
          usage: "off_session",
          ...(requestThreeDSecure
            ? { payment_method_options: { card: { request_three_d_secure: "any" } } }
            : {}),
        });
        if (!setupIntent.client_secret) {
          return { ok: false, status: 500, error: "決済の初期化に失敗しました" };
        }
        return {
          ok: true,
          value: {
            kind: "stripe_setup_intent",
            clientSecret: setupIntent.client_secret,
            customerId,
          },
        };
      } catch {
        return { ok: false, status: 502, error: "通信エラーが発生しました" };
      }
    },

    async registerCard({
      payload,
    }: {
      userId: string;
      userEmail: string | null;
      existing: StoredCustomer | null;
      payload: RegisterCardPayload;
    }): Promise<ProviderResult<RegisteredCardIds>> {
      if (payload.provider !== "stripe") {
        return { ok: false, status: 400, error: "決済方式が一致しません" };
      }
      try {
        // クライアントの申告を信じず、Stripe から直接取り直して検証する。
        // succeeded は 3DS 等の認証要件を満たさない限り遷移しない状態。
        const setupIntent = await stripe.setupIntents.retrieve(payload.setupIntentId);
        if (setupIntent.status !== "succeeded") {
          return {
            ok: false,
            status: 402,
            error: "カードの確認が完了していません。カード登録をやり直してください。",
          };
        }
        const customerId =
          typeof setupIntent.customer === "string"
            ? setupIntent.customer
            : setupIntent.customer?.id;
        const paymentMethodId =
          typeof setupIntent.payment_method === "string"
            ? setupIntent.payment_method
            : setupIntent.payment_method?.id;
        if (!customerId || !paymentMethodId) {
          return { ok: false, status: 500, error: "カードの登録に失敗しました" };
        }
        return {
          ok: true,
          value: { stripeCustomerId: customerId, stripePaymentMethodId: paymentMethodId },
        };
      } catch {
        return { ok: false, status: 502, error: "カードの確認に失敗しました" };
      }
    },

    hasUsableCard(customer: StoredCustomer | null): boolean {
      return !!customer?.stripeCustomerId && !!customer?.stripePaymentMethodId;
    },

    async charge(input: ChargeInput): Promise<ChargeOutcome> {
      const { stripeCustomerId, stripePaymentMethodId } = input.customer;
      if (!stripeCustomerId || !stripePaymentMethodId) {
        return { kind: "error", message: "買い手のカードが登録されていません", httpStatus: 409 };
      }
      if (!input.sellerAccountId) {
        return {
          kind: "error",
          message: "出品者の受取口座の設定が完了していません。",
          httpStatus: 409,
        };
      }
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount: input.amountJpy,
            currency: "jpy",
            customer: stripeCustomerId,
            payment_method: stripePaymentMethodId,
            off_session: true,
            confirm: true,
            payment_method_types: ["card"],
            transfer_data: { destination: input.sellerAccountId },
            ...(input.applicationFeeJpy > 0
              ? { application_fee_amount: input.applicationFeeJpy }
              : {}),
            description: input.description,
            metadata: input.metadata,
            statement_descriptor_suffix: "TETOMI",
          },
          { idempotencyKey: input.idempotencyKey },
        );

        const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : null;
        if (pi.status === "succeeded" && chargeId) {
          return { kind: "succeeded", chargeId, paymentIntentId: pi.id };
        }
        if (pi.status === "requires_action") {
          return { kind: "requires_action", paymentIntentId: pi.id };
        }
        // ここに来るのは想定外の状態（succeeded なのに latest_charge が無い等）。
        // Webhook 側で拾えるよう、DBは変更せずエラーとして返す。
        return {
          kind: "error",
          message: "決済の状態を確認できませんでした。運営にお問い合わせください。",
          httpStatus: 500,
        };
      } catch (err) {
        return classifyChargeError(err);
      }
    },
  };
}
