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

-- anon にも実行権を付ける。listings の閲覧ポリシーがこの関数を呼ぶため、
-- 外すとログインしていない人の出品一覧が壊れる（20260918…_restore_anon_is_enrollment_active）。
REVOKE ALL ON FUNCTION "public"."is_enrollment_active"("uid" "uuid") FROM PUBLIC;

GRANT ALL ON FUNCTION "public"."is_enrollment_active"("uid" "uuid") TO "anon";

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
