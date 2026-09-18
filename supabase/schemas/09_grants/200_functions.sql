GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."count_active_listings"() TO "anon";

GRANT ALL ON FUNCTION "public"."count_active_listings"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."count_active_listings"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enforce_email_domain"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."enforce_email_domain"() TO "service_role";

GRANT ALL ON FUNCTION "public"."get_newest_listings"("p_limit" integer) TO "anon";

GRANT ALL ON FUNCTION "public"."get_newest_listings"("p_limit" integer) TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_newest_listings"("p_limit" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";

-- ここは本番の現状と意図的に違う。本番では anon にも実行権が付いてしまっており
-- （docs/supabase-migration-2 の revoke が効いていない）、ログインしていない人でも
-- 「この利用者IDは在籍中か」を問い合わせられる状態。あるべき姿はこちら。
-- 本番への反映はタスク10。pgTAP で anon が呼べないことを見張る。
REVOKE ALL ON FUNCTION "public"."is_enrollment_active"("uid" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_enrollment_active"("uid" "uuid") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_enrollment_active"("uid" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."is_university_email_taken"("p_email" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."is_university_email_taken"("p_email" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."is_university_email_taken"("p_email" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."reset_recovery_email_verified"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."reset_recovery_email_verified"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."sync_listing_status"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."sync_listing_status"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."validate_reservation"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."validate_reservation"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."validate_reservation_update"() FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."validate_reservation_update"() TO "service_role";
