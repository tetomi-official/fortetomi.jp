CREATE TABLE IF NOT EXISTS "public"."reservations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "price" integer NOT NULL,
    "preferred_date" "text" NOT NULL,
    "preferred_time" "text" NOT NULL,
    "preferred_location" "text" NOT NULL,
    "message" "text",
    "status" "text" DEFAULT '申請中'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "proposed_date" "text",
    "proposed_time" "text",
    "proposed_location" "text",
    "candidate_slots" "jsonb",
    "selected_slot" smallint,
    "charge_id" "text",
    "paid_at" timestamp with time zone,
    "payment_nonce_hash" "text",
    "payment_provider" "text",
    "payment_intent_id" "text",
    "payment_status" "text",
    "payment_error_code" "text",
    CONSTRAINT "reservations_payment_provider_chk" CHECK ((("payment_provider" IS NULL) OR ("payment_provider" = ANY (ARRAY['payjp'::"text", 'stripe'::"text"])))),
    CONSTRAINT "reservations_payment_status_chk" CHECK ((("payment_status" IS NULL) OR ("payment_status" = ANY (ARRAY['requires_action'::"text", 'failed'::"text", 'disputed'::"text"])))),
    CONSTRAINT "reservations_price_check" CHECK (("price" >= 0)),
    CONSTRAINT "reservations_status_chk" CHECK (("status" = ANY (ARRAY['申請中'::"text", '日程調整中'::"text", '承認済み'::"text", '完了'::"text", 'キャンセル'::"text"])))
);

COMMENT ON COLUMN "public"."reservations"."charge_id" IS '支払いID。PAY.jp は Charge ID、Stripe は PaymentIntent.latest_charge(ch_)。pi_ は入れない。';

COMMENT ON COLUMN "public"."reservations"."paid_at" IS '決済完了時刻（service_role が記録）';

COMMENT ON COLUMN "public"."reservations"."payment_nonce_hash" IS '受け渡しQRワンタイムトークンの SHA-256。買い手がQR表示時に発行、決済成功で null 化。';

COMMENT ON COLUMN "public"."reservations"."payment_provider" IS '決済に使った会社（payjp / stripe）。';

COMMENT ON COLUMN "public"."reservations"."payment_intent_id" IS 'Stripe PaymentIntent(pi_)。PAY.jp では null。';

COMMENT ON COLUMN "public"."reservations"."payment_status" IS '課金が成立しなかったときの状態。requires_action=本人認証待ち / failed=拒否 / disputed=チャージバック。成立時は null。';

COMMENT ON COLUMN "public"."reservations"."payment_error_code" IS '拒否コード（card_declined 等）。運営の調査用。';

ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."reservations"
    ADD CONSTRAINT "reservations_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
