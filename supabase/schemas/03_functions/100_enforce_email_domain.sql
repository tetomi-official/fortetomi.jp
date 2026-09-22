CREATE OR REPLACE FUNCTION "public"."enforce_email_domain"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;
