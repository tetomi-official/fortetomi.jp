ALTER TABLE "public"."listings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listings are viewable by everyone" ON "public"."listings" FOR SELECT USING (("public"."is_enrollment_active"("seller_id") OR (( SELECT "auth"."uid"() AS "uid") = "seller_id")));

CREATE POLICY "users can delete own listings" ON "public"."listings" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "seller_id"));

CREATE POLICY "users can insert own listings" ON "public"."listings" FOR INSERT WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "seller_id") AND "public"."is_enrollment_active"(( SELECT "auth"."uid"() AS "uid"))));

CREATE POLICY "users can update own listings" ON "public"."listings" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "seller_id"));

-- 運営は全部の出品を読める（#60）。
-- 上の「誰でも見られる」ポリシーは在籍中の出品者のものだけを通すので、
-- 卒業・在籍切れの出品者の取引が管理画面の一覧から丸ごと消えてしまう。
-- （取引一覧は listings と突き合わせて教科書名を出すため）
CREATE POLICY "admins can read all listings" ON "public"."listings" FOR SELECT TO "authenticated" USING ("public"."is_admin"());
