GRANT SELECT,MAINTAIN ON TABLE "public"."listings" TO "anon";

GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."listings" TO "authenticated";

GRANT ALL ON TABLE "public"."listings" TO "service_role";
