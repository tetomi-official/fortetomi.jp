CREATE OR REPLACE FUNCTION "public"."enforce_email_domain"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if split_part(lower(new.email), '@', 2) <> 'g.chuo-u.ac.jp' then
    raise exception 'email domain not allowed: signup must use @g.chuo-u.ac.jp';
  end if;
  return new;
end;
$$;
