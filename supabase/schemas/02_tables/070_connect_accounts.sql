CREATE TABLE IF NOT EXISTS "public"."connect_accounts" (
    "user_id" "uuid" NOT NULL,
    "stripe_account_id" "text" NOT NULL,
    "transfers_enabled" boolean DEFAULT false NOT NULL,
    "payouts_enabled" boolean DEFAULT false NOT NULL,
    "requirements_due" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "disabled_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

COMMENT ON TABLE "public"."connect_accounts" IS '出品者の Stripe 連結アカウント(acct_)と受取可否。書き込みは service_role のみ（他人の出品の売上を横取りされないため）。';

COMMENT ON COLUMN "public"."connect_accounts"."stripe_account_id" IS 'Stripe Connect の連結アカウント(acct_)。authenticated には grant しない＝ブラウザからは読めない。';

COMMENT ON COLUMN "public"."connect_accounts"."transfers_enabled" IS '送金を受け取れるか。v2 の configuration.recipient.capabilities.stripe_balance.stripe_transfers.status === active。 受け渡し課金（destination charge）の可否ゲートはこの列で判定する。';

COMMENT ON COLUMN "public"."connect_accounts"."payouts_enabled" IS '銀行口座への入金を受けられるか。v2 の ...capabilities.stripe_balance.payouts.status === active。';

COMMENT ON COLUMN "public"."connect_accounts"."requirements_due" IS 'Stripe が出品者本人の入力を待っている項目（v2 requirements.entries のうち awaiting_action_from=user の description）。空なら入力待ちなし。';

COMMENT ON COLUMN "public"."connect_accounts"."disabled_reason" IS '送金ケイパビリティが有効でない理由（v2 の capability status_details の code）。';

ALTER TABLE ONLY "public"."connect_accounts"
    ADD CONSTRAINT "connect_accounts_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."connect_accounts"
    ADD CONSTRAINT "connect_accounts_stripe_account_id_key" UNIQUE ("stripe_account_id");

ALTER TABLE ONLY "public"."connect_accounts"
    ADD CONSTRAINT "connect_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
