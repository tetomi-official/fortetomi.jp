CREATE TABLE IF NOT EXISTS "public"."syllabus_textbooks" (
    "id" bigint NOT NULL,
    "course_id" bigint NOT NULL,
    "isbn13" "text" NOT NULL,
    "isbn_raw" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

COMMENT ON TABLE "public"."syllabus_textbooks" IS 'ISBN→科目 の逆引き（PB-058 照合用）。scrape-syllabus.mjs が course ごとに再構築する。';

CREATE SEQUENCE IF NOT EXISTS "public"."syllabus_textbooks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."syllabus_textbooks_id_seq" OWNED BY "public"."syllabus_textbooks"."id";

ALTER TABLE ONLY "public"."syllabus_textbooks" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."syllabus_textbooks_id_seq"'::"regclass");

ALTER TABLE ONLY "public"."syllabus_textbooks"
    ADD CONSTRAINT "syllabus_textbooks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."syllabus_textbooks"
    ADD CONSTRAINT "syllabus_textbooks_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."syllabus_courses"("id") ON DELETE CASCADE;
