-- 既読は本人が付け直すもの（同じ行を何度も上書きする）ので、列を絞らず UPDATE を渡す。
-- 行はポリシーで自分の分に限られるため、他人の既読には触れない。
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."message_reads" TO "authenticated";

GRANT ALL ON TABLE "public"."message_reads" TO "service_role";
