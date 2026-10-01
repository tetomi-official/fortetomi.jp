CREATE OR REPLACE FUNCTION "public"."is_university_email_taken"("p_email" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles_private
    where lower(university_email) = lower(p_email)
  );
$$;
