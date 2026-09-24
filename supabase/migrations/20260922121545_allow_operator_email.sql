SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.enforce_email_domain()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  -- 運営のアドレスだけは大学ドメインでなくても通す（#60）。
  -- 一覧は 03_functions/005_is_operator_email.sql。
  if public.is_operator_email(new.email) then
    return new;
  end if;
  if split_part(lower(new.email), '@', 2) <> 'g.chuo-u.ac.jp' then
    raise exception 'email domain not allowed: signup must use @g.chuo-u.ac.jp';
  end if;
  return new;
end;
$function$;

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
    new.raw_user_meta_data ->> 'name',
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

CREATE OR REPLACE FUNCTION public.is_operator_email (
  p_email text
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  AS $function$
  select lower(trim(coalesce(p_email, ''))) = any (array[
    'tetomitextbook@gmail.com'
  ]);
$function$;

REVOKE ALL ON FUNCTION "public"."is_operator_email"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."is_operator_email"(text) TO "postgres", "service_role";
