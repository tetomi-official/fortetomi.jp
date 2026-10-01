CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "bucket" "text" NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL
);

COMMENT ON TABLE "public"."rate_limits" IS 'レート制限の原子的カウンタ。service_role 専用（check_rate_limit 経由でのみ更新）。';

ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("bucket");
