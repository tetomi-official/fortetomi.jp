GRANT ALL ON TABLE "public"."syllabus_textbooks" TO "service_role";

GRANT SELECT ON TABLE "public"."syllabus_textbooks" TO "authenticated";

-- ログインしていない人にも読ませる。詳細ページの「この本を使う授業」欄を出すため。
-- 中身は大学のシラバスサイトで公開されている情報（授業名・担当教員など）。
GRANT SELECT ON TABLE "public"."syllabus_textbooks" TO "anon";
