ALTER TABLE "public"."connect_accounts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own connect account is viewable" ON "public"."connect_accounts" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));
