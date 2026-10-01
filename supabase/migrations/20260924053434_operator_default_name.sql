SET local check_function_bodies = off;

REVOKE ALL ON FUNCTION "public"."is_operator_email"(text) FROM "anon";

REVOKE ALL ON FUNCTION "public"."is_operator_email"(text) FROM "authenticated";

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  -- 運営のアドレスなら、その場で運営フラグを立てる（#60）。
  -- is_admin は誰も UPDATE できない列なので、アカウントを作った順番に関係なく
  -- 運営になるよう、行を作るこの場で決める。
  insert into public.profiles (id, name, university, faculty, grade, is_admin)
  values (
    new.id,
    -- 運営は Supabase のダッシュボードから作るので、名前を入れる欄が無い。
    -- 名無しのまま画面に出ると分かりにくいので、ここで既定の名前を入れる（#60）。
    coalesce(
      new.raw_user_meta_data ->> 'name',
      case when public.is_operator_email(new.email) then '運営 スタッフ' end
    ),
    new.raw_user_meta_data ->> 'university',
    new.raw_user_meta_data ->> 'faculty',
    new.raw_user_meta_data ->> 'grade',
    public.is_operator_email(new.email)
  );
  insert into public.profiles_private (id, university_email, recovery_email, gender)
  values (
    new.id,
    new.email,                                    -- 大学メール（＝ログインID）
    new.raw_user_meta_data ->> 'recovery_email',  -- 復旧用の個人メール
    new.raw_user_meta_data ->> 'gender'
  );
  return new;
end;
$function$;
