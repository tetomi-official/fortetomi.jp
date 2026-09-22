-- 運営のメールアドレスかどうか（#60）。
--
-- 運営は学生ではないので大学メールを持たない。会員登録の入口（@g.chuo-u.ac.jp のみ）を
-- 広げるのではなく、ここに書いたアドレスだけを例外として通す。
-- アドレスを足すのは migration から。ここが唯一の定義で、
--   ・enforce_email_domain … このアドレスなら auth.users への追加を許す
--   ・handle_new_user      … このアドレスなら profiles.is_admin を立てる
-- の2つが参照する。
--
-- ※ このアドレスで会員登録画面から登録することはできない（入学年を読めないため）。
--   運営のアカウントは Supabase のダッシュボードから作る。
--   → docs/operations/manual-setup-checklist.md
CREATE OR REPLACE FUNCTION "public"."is_operator_email"("p_email" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(trim(coalesce(p_email, ''))) = any (array[
    'tetomitextbook@gmail.com'
  ]);
$$;
