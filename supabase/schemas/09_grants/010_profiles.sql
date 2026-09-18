GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";

GRANT ALL ON TABLE "public"."profiles" TO "service_role";

GRANT UPDATE("name") ON TABLE "public"."profiles" TO "authenticated";

GRANT UPDATE("university") ON TABLE "public"."profiles" TO "authenticated";

GRANT UPDATE("faculty") ON TABLE "public"."profiles" TO "authenticated";

GRANT UPDATE("grade") ON TABLE "public"."profiles" TO "authenticated";
