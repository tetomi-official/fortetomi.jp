-- 本番で見つかった権限の穴を塞ぎ、使われていない試作の残りを片付ける。
--
-- 1) is_enrollment_active … docs/supabase-migration-2 に「anon から外す」と
--    書かれているのに本番で効いておらず、ログインしていない人でも
--    「この利用者IDは在籍中か」を問い合わせられた。
-- 2) check_rate_limit  … docs/supabase-migration-12 は anon / authenticated から
--    しか外しておらず、既定の PUBLIC 実行権が残っていた（＝誰でも呼べた）。
--    ファイルの意図は service_role 専用。他人の回数券を勝手に消費できてしまう。
-- 3) books / users … 2026-03 の試作の残り。いずれも0件で、
--    アプリからの参照も無い。定義は git 履歴と docs/archive に残る。
--
-- ローカルは最初からこの状態なので、ここは本番に追いつくための差分。

revoke all on function public.is_enrollment_active(uuid) from public, anon;
grant execute on function public.is_enrollment_active(uuid) to authenticated;

revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;

drop table if exists public.books;
drop table if exists public.users;
-- book-images バケットは SQL からは消せない（Storage が直接削除を禁じている）。
-- Storage API で別途消す。詳細は docs/db-workflow.md。
