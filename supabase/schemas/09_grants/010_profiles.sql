GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";

GRANT ALL ON TABLE "public"."profiles" TO "service_role";

GRANT UPDATE("name") ON TABLE "public"."profiles" TO "authenticated";

GRANT UPDATE("university") ON TABLE "public"."profiles" TO "authenticated";

GRANT UPDATE("faculty") ON TABLE "public"."profiles" TO "authenticated";

GRANT UPDATE("grade") ON TABLE "public"."profiles" TO "authenticated";

-- ログインしていない人に読ませる列。出品カードと詳細の出品者欄に出ているものだけ。
-- 在籍期限（enrollment_valid_until）や在籍確認の有無などは渡さない。
-- 行の絞り込み（見えている出品の出品者だけ）は 04_policies/010_profiles.sql。
GRANT SELECT("id", "name", "faculty", "grade", "rating", "rating_count") ON TABLE "public"."profiles" TO "anon";
