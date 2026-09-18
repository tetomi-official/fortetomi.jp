CREATE POLICY "own payment customer is viewable" ON "public"."payment_customers" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

ALTER TABLE "public"."payment_customers" ENABLE ROW LEVEL SECURITY;
