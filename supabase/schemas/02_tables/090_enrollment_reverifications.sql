CREATE TABLE IF NOT EXISTS "public"."enrollment_reverifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."enrollment_reverifications"
    ADD CONSTRAINT "enrollment_reverifications_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."enrollment_reverifications"
    ADD CONSTRAINT "enrollment_reverifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
