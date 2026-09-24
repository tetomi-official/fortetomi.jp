GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."reservations" TO "authenticated";

GRANT ALL ON TABLE "public"."reservations" TO "service_role";

GRANT UPDATE("status") ON TABLE "public"."reservations" TO "authenticated";

GRANT UPDATE("proposed_date") ON TABLE "public"."reservations" TO "authenticated";

GRANT UPDATE("proposed_time") ON TABLE "public"."reservations" TO "authenticated";

GRANT UPDATE("proposed_location") ON TABLE "public"."reservations" TO "authenticated";

GRANT UPDATE("selected_slot") ON TABLE "public"."reservations" TO "authenticated";
