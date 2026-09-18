CREATE POLICY "buyer or seller can update reservation" ON "public"."reservations" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "seller_id"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "seller_id")));

CREATE POLICY "buyers can insert own reservations" ON "public"."reservations" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "buyer_id") AND "public"."is_enrollment_active"(( SELECT "auth"."uid"() AS "uid"))));

ALTER TABLE "public"."reservations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservations viewable by buyer or seller" ON "public"."reservations" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "seller_id")));
