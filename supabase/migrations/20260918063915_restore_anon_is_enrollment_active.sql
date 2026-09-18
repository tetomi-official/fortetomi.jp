-- is_enrollment_active を、ログインしていない人（anon）にも使えるように戻す。
--
-- 20260918041649 で anon から外したが、それが誤りだった。
-- listings の閲覧ポリシー "listings are viewable by everyone" がこの関数を呼んでおり、
-- anon に実行権が無いと、ログインしていない人の出品一覧が
-- 「permission denied for function is_enrollment_active」で失敗する。
-- ログインなしの閲覧は意図した仕様（docs/supabase-migration-4、プレリリースのフェーズ0）。
--
-- 隠す意味も無かった：この関数が答えるのは「在籍中か」だけで、
-- 在籍中の人の出品は誰でも一覧で見られるため、もともと分かる情報。
-- （docs/supabase-migration-2 の「anon から外す」と migration-4 が食い違っていた）

grant execute on function public.is_enrollment_active(uuid) to anon;
