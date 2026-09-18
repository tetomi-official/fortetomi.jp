GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."profiles_private" TO "authenticated";

GRANT ALL ON TABLE "public"."profiles_private" TO "service_role";

GRANT UPDATE("gender") ON TABLE "public"."profiles_private" TO "authenticated";

GRANT UPDATE("recovery_email") ON TABLE "public"."profiles_private" TO "authenticated";
