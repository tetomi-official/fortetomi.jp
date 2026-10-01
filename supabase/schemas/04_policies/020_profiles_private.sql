CREATE POLICY "own private insert" ON "public"."profiles_private" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));

CREATE POLICY "own private read" ON "public"."profiles_private" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "id"));

CREATE POLICY "own private update" ON "public"."profiles_private" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));

ALTER TABLE "public"."profiles_private" ENABLE ROW LEVEL SECURITY;
