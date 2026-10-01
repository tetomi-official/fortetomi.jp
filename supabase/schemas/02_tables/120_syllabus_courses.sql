CREATE TABLE IF NOT EXISTS "public"."syllabus_courses" (
    "id" bigint NOT NULL,
    "year" integer,
    "faculty" "text",
    "campus" "text",
    "course_name" "text",
    "course_code" "text",
    "instructor" "text",
    "instructor_kana" "text",
    "term" "text",
    "day_period" "text",
    "year_level" "text",
    "credits" integer,
    "language" "text",
    "summary" "text",
    "objectives" "text",
    "schedule" "text",
    "grading" "text",
    "references_raw" "text",
    "other_notes" "text",
    "ref_url" "text",
    "textbooks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "raw_items" "jsonb",
    "source_url" "text",
    "scraped_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

COMMENT ON TABLE "public"."syllabus_courses" IS '中央大学シラバスDBのスクレイピング結果（1科目1行）。書き込みは service_role のみ。PB-056。';

COMMENT ON COLUMN "public"."syllabus_courses"."id" IS 'シラバスサイト /syllabus/detail/?id=N の数値ID（upsert の自然キー）';

COMMENT ON COLUMN "public"."syllabus_courses"."textbooks" IS 'references_raw から抽出した ISBN 群 [{isbn13, isbn_raw}]';

ALTER TABLE ONLY "public"."syllabus_courses"
    ADD CONSTRAINT "syllabus_courses_pkey" PRIMARY KEY ("id");
