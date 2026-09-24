CREATE TABLE IF NOT EXISTS "public"."email_recovery_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."email_recovery_requests"
    ADD CONSTRAINT "email_recovery_requests_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."email_recovery_requests"
    ADD CONSTRAINT "email_recovery_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
