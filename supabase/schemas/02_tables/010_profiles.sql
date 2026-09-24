CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "university" "text",
    "faculty" "text",
    "grade" "text",
    "enrollment_verified" boolean DEFAULT false NOT NULL,
    "rating" numeric DEFAULT 5 NOT NULL,
    "rating_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "enrollment_valid_until" timestamp with time zone,
    "is_admin" boolean DEFAULT false NOT NULL
);

COMMENT ON COLUMN "public"."profiles"."is_admin" IS '運営かどうか。運営だけが取引一覧（/admin）を見られる。本人に書き換えられないよう、authenticated には UPDATE(is_admin) を付けない（09_grants/010_profiles.sql）。立てるのは migration からだけ。';

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
