CREATE POLICY "sellers with visible listings are viewable by anyone" ON "public"."profiles"
  FOR SELECT
  TO "anon"
  USING ((EXISTS ( SELECT 1
   FROM public.listings l
  WHERE (l.seller_id = profiles.id))));

REVOKE ALL ("faculty") ON TABLE "public"."profiles" FROM "anon";

GRANT SELECT ("faculty") ON TABLE "public"."profiles" TO "anon";

REVOKE ALL ("grade") ON TABLE "public"."profiles" FROM "anon";

GRANT SELECT ("grade") ON TABLE "public"."profiles" TO "anon";

REVOKE ALL ("id") ON TABLE "public"."profiles" FROM "anon";

GRANT SELECT ("id") ON TABLE "public"."profiles" TO "anon";

REVOKE ALL ("name") ON TABLE "public"."profiles" FROM "anon";

GRANT SELECT ("name") ON TABLE "public"."profiles" TO "anon";

REVOKE ALL ("rating_count") ON TABLE "public"."profiles" FROM "anon";

GRANT SELECT ("rating_count") ON TABLE "public"."profiles" TO "anon";

REVOKE ALL ("rating") ON TABLE "public"."profiles" FROM "anon";

GRANT SELECT ("rating") ON TABLE "public"."profiles" TO "anon";
