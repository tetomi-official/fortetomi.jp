GRANT ALL ON TABLE "public"."connect_accounts" TO "service_role";

GRANT SELECT("user_id") ON TABLE "public"."connect_accounts" TO "authenticated";

GRANT SELECT("transfers_enabled") ON TABLE "public"."connect_accounts" TO "authenticated";

GRANT SELECT("payouts_enabled") ON TABLE "public"."connect_accounts" TO "authenticated";

GRANT SELECT("requirements_due") ON TABLE "public"."connect_accounts" TO "authenticated";

GRANT SELECT("disabled_reason") ON TABLE "public"."connect_accounts" TO "authenticated";

GRANT SELECT("created_at") ON TABLE "public"."connect_accounts" TO "authenticated";

GRANT SELECT("updated_at") ON TABLE "public"."connect_accounts" TO "authenticated";
