-- どの取引のメッセージを、誰が、いつまで読んだか。
--
-- 使い道は1つだけ：新着メールを送りすぎないこと（#59）。
-- 「相手がまだ読んでいない知らせが既にある」ときは、次のメッセージでメールを送らない。
-- 画面に「既読」を出すためのものではないので、持つのは最後に開いた時刻だけにしてある。
CREATE TABLE IF NOT EXISTS "public"."message_reads" (
    "reservation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_pkey" PRIMARY KEY ("reservation_id", "user_id");

ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
