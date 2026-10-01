GRANT ALL ON TABLE "public"."payment_customers" TO "service_role";

GRANT SELECT("user_id") ON TABLE "public"."payment_customers" TO "authenticated";

GRANT SELECT("created_at") ON TABLE "public"."payment_customers" TO "authenticated";

GRANT SELECT("updated_at") ON TABLE "public"."payment_customers" TO "authenticated";

GRANT SELECT("provider") ON TABLE "public"."payment_customers" TO "authenticated";
