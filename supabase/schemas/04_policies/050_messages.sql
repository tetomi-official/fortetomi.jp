ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages viewable by reservation participants" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."reservations" "r"
  WHERE (("r"."id" = "messages"."reservation_id") AND (("auth"."uid"() = "r"."buyer_id") OR ("auth"."uid"() = "r"."seller_id"))))));

CREATE POLICY "participants can insert own messages" ON "public"."messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."reservations" "r"
  WHERE (("r"."id" = "messages"."reservation_id") AND (("auth"."uid"() = "r"."buyer_id") OR ("auth"."uid"() = "r"."seller_id")))))));
