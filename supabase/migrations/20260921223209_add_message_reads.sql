CREATE TABLE "public"."message_reads" (
  "reservation_id" uuid                     NOT NULL,
  "user_id"        uuid                     NOT NULL,
  "last_read_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "message_reads_pkey" PRIMARY KEY (reservation_id, user_id)
);

ALTER TABLE "public"."message_reads"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."message_reads"
  ADD CONSTRAINT "message_reads_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE CASCADE;

ALTER TABLE "public"."message_reads"
  ADD CONSTRAINT "message_reads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE POLICY "own read marker is viewable" ON "public"."message_reads"
  FOR SELECT
  TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "participants can insert own read marker" ON "public"."message_reads"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM public.reservations r
  WHERE ((r.id = message_reads.reservation_id) AND ((( SELECT auth.uid() AS uid) = r.buyer_id) OR (( SELECT auth.uid() AS uid) = r.seller_id)))))));

CREATE POLICY "participants can update own read marker" ON "public"."message_reads"
  FOR UPDATE
  TO PUBLIC
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM public.reservations r
  WHERE ((r.id = message_reads.reservation_id) AND ((( SELECT auth.uid() AS uid) = r.buyer_id) OR (( SELECT auth.uid() AS uid) = r.seller_id)))))));

-- 新しいテーブルには anon・authenticated へ全権限が自動で付く。先にはがしてから
-- 必要なぶんだけ付け直す（docs/operations/db-workflow.md の (a)）。
-- anon の行は declarative sync が出さないので手で足した。
REVOKE ALL ON TABLE "public"."message_reads" FROM "anon", "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."message_reads" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."message_reads" TO "postgres", "service_role";
