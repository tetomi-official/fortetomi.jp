CREATE POLICY "buyer or seller can update reservation" ON "public"."reservations" FOR UPDATE USING (((( SELECT "auth"."uid"() AS "uid") = "buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "seller_id"))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "seller_id")));

CREATE POLICY "buyers can insert own reservations" ON "public"."reservations" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "buyer_id") AND "public"."is_enrollment_active"(( SELECT "auth"."uid"() AS "uid"))));

ALTER TABLE "public"."reservations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservations viewable by buyer or seller" ON "public"."reservations" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "buyer_id") OR (( SELECT "auth"."uid"() AS "uid") = "seller_id")));

-- 運営は全部の取引を読める（#60）。
-- ポリシーは足し算なので、上の「買い手か出品者なら読める」はそのまま効く。
-- TO authenticated に限るのは、ログインしていない経路で is_admin() を評価させないため。
CREATE POLICY "admins can read all reservations" ON "public"."reservations" FOR SELECT TO "authenticated" USING ("public"."is_admin"());
