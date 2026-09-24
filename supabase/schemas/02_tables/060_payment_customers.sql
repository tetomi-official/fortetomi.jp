CREATE TABLE IF NOT EXISTS "public"."payment_customers" (
    "user_id" "uuid" NOT NULL,
    "payjp_customer_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider" "text" DEFAULT 'payjp'::"text" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_payment_method_id" "text",
    CONSTRAINT "payment_customers_any_id_chk" CHECK ((("payjp_customer_id" IS NOT NULL) OR ("stripe_customer_id" IS NOT NULL))),
    CONSTRAINT "payment_customers_provider_chk" CHECK (("provider" = ANY (ARRAY['payjp'::"text", 'stripe'::"text"])))
);

COMMENT ON TABLE "public"."payment_customers" IS '買い手の PAY.jp Customer(cus_) 保存先。書き込みは service_role のみ（他人のカードへの課金を防ぐ）。';

COMMENT ON COLUMN "public"."payment_customers"."provider" IS '最後にカード登録した決済会社（payjp / stripe）。記録用であって、課金可否の判定には使わない。';

COMMENT ON COLUMN "public"."payment_customers"."stripe_customer_id" IS 'Stripe Customer(cus_)。service_role のみ書き込み。';

COMMENT ON COLUMN "public"."payment_customers"."stripe_payment_method_id" IS 'Stripe PaymentMethod(pm_)。受け渡し時のオフセッション課金で使う保存済みカード。';

ALTER TABLE ONLY "public"."payment_customers"
    ADD CONSTRAINT "payment_customers_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."payment_customers"
    ADD CONSTRAINT "payment_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
