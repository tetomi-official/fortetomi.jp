CREATE TABLE IF NOT EXISTS "public"."recovery_email_verifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."recovery_email_verifications"
    ADD CONSTRAINT "recovery_email_verifications_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."recovery_email_verifications"
    ADD CONSTRAINT "recovery_email_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
