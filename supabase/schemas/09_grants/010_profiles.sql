-- INSERT は列を指定して付ける。テーブルごと付けると is_admin も書ける形になり、
-- 「users can insert own profile」ポリシー（自分の行なら通る）と合わさって、
-- 自分で自分を運営にできてしまう。今は handle_new_user トリガーが行を作るので
-- 画面からの insert は無いが、塞げる形にしておく（#60）。
GRANT SELECT,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";

GRANT INSERT("id", "name", "university", "faculty", "grade") ON TABLE "public"."profiles" TO "authenticated";

GRANT ALL ON TABLE "public"."profiles" TO "service_role";

GRANT UPDATE("name") ON TABLE "public"."profiles" TO "authenticated";

GRANT UPDATE("university") ON TABLE "public"."profiles" TO "authenticated";

GRANT UPDATE("faculty") ON TABLE "public"."profiles" TO "authenticated";

GRANT UPDATE("grade") ON TABLE "public"."profiles" TO "authenticated";

-- is_admin は UPDATE を付けない。付けると本人が自分を運営にできる（#60）。
-- 立てられるのは service_role と migration だけ。

-- ログインしていない人に読ませる列。出品カードと詳細の出品者欄に出ているものだけ。
-- 在籍期限（enrollment_valid_until）や在籍確認の有無などは渡さない。
-- 行の絞り込み（見えている出品の出品者だけ）は 04_policies/010_profiles.sql。
GRANT SELECT("id", "name", "faculty", "grade", "rating", "rating_count") ON TABLE "public"."profiles" TO "anon";
