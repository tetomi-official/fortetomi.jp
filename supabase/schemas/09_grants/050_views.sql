-- 運営の取引一覧の view（#60）。
-- authenticated にだけ SELECT を付ける。運営でない人が読んでも、
-- view の中の where public.is_admin() と元テーブルの RLS で 0 行になる。
GRANT SELECT ON TABLE "public"."admin_reservations" TO "authenticated";

GRANT ALL ON TABLE "public"."admin_reservations" TO "service_role";
