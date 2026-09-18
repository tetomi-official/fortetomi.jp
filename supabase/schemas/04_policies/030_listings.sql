ALTER TABLE "public"."listings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listings are viewable by everyone" ON "public"."listings" FOR SELECT USING (("public"."is_enrollment_active"("seller_id") OR (( SELECT "auth"."uid"() AS "uid") = "seller_id")));

CREATE POLICY "users can delete own listings" ON "public"."listings" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "seller_id"));

CREATE POLICY "users can insert own listings" ON "public"."listings" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "seller_id") AND "public"."is_enrollment_active"(( SELECT "auth"."uid"() AS "uid"))));

CREATE POLICY "users can update own listings" ON "public"."listings" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "seller_id"));
