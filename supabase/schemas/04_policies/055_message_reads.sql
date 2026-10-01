ALTER TABLE "public"."message_reads" ENABLE ROW LEVEL SECURITY;

-- 自分の既読だけ。他人が「いつ読んだか」は誰にも見せない。
CREATE POLICY "own read marker is viewable" ON "public"."message_reads" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

-- 書けるのは自分の分だけ。かつ、その取引の当事者であること
-- （関係のない取引の行を作られても困らないが、messages と同じ線引きに揃える）。
CREATE POLICY "participants can insert own read marker" ON "public"."message_reads" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."reservations" "r"
  WHERE (("r"."id" = "message_reads"."reservation_id") AND ((( SELECT "auth"."uid"() AS "uid") = "r"."buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "r"."seller_id")))))));

CREATE POLICY "participants can update own read marker" ON "public"."message_reads" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."reservations" "r"
  WHERE (("r"."id" = "message_reads"."reservation_id") AND ((( SELECT "auth"."uid"() AS "uid") = "r"."buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "r"."seller_id")))))));
