CREATE OR REPLACE FUNCTION "public"."is_enrollment_active"("uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.enrollment_valid_until is not null
      and p.enrollment_valid_until > now()
  );
$$;
