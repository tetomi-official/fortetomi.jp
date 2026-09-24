-- 既定で付いてしまう権限を、いったん全部はがす。
--
-- Supabase は public に新しいテーブル・関数を作ると、anon と authenticated に
-- 自動で全権限を付ける（クラウドもローカルも同じ）。このあとのファイルは
-- 「本番で実際に付いている権限」を足し直すだけなので、先にここで白紙に戻さないと
-- 余計な権限が残る。docs の SQL が revoke all から始めていたのと同じ考え方。

REVOKE ALL ON TABLE "public"."profiles" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."profiles_private" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."listings" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."reservations" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."messages" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."message_reads" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."payment_customers" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."connect_accounts" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."email_recovery_requests" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."enrollment_reverifications" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."recovery_email_verifications" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."rate_limits" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."handover_reminders" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."syllabus_courses" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."syllabus_textbooks" FROM "anon", "authenticated";
-- view にも既定の権限が付く。運営用なので、いったん全部はがしてから
-- 09_grants/050_views.sql で authenticated にだけ付け直す。
REVOKE ALL ON TABLE "public"."admin_reservations" FROM "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."is_enrollment_active"("uid" "uuid") FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."is_operator_email"("p_email" "text") FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."check_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."count_active_listings"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."enforce_email_domain"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."get_newest_listings"("p_limit" integer) FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."is_university_email_taken"("p_email" "text") FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."reset_recovery_email_verified"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."sync_listing_status"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."validate_reservation"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."validate_reservation_update"() FROM PUBLIC, "anon", "authenticated";
