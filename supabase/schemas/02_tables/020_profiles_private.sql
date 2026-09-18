CREATE TABLE IF NOT EXISTS "public"."profiles_private" (
    "id" "uuid" NOT NULL,
    "university_email" "text",
    "pending_personal_email" "text",
    "gender" "text",
    "recovery_email" "text",
    "recovery_email_verified" boolean DEFAULT false NOT NULL,
    "recovery_email_verified_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."profiles_private"
    ADD CONSTRAINT "profiles_private_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."profiles_private"
    ADD CONSTRAINT "profiles_private_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
