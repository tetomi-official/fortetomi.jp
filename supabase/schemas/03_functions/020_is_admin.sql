-- 今ログインしている人が運営かどうか。
--
-- ポリシーの中から profiles を直接読むと、profiles 自身のポリシー評価を
-- 呼び戻して再帰するので、SECURITY DEFINER の関数にして切り離す。
-- is_enrollment_active と同じ作り。
--
-- ※ anon には EXECUTE を付けない（09_grants/200_functions.sql）。
--   この関数を呼ぶポリシーは、すべて TO authenticated に限っているため、
--   ログインしていない人の経路では評価されない。
--   （2026-09-18 に is_enrollment_active を anon から外して一覧が空になった件の教訓で、
--     「誰がこの関数を呼ぶか」を先に決めてから権限を決めている）
CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_admin
  );
$$;
