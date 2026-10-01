CREATE OR REPLACE FUNCTION "public"."count_active_listings"() RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select count(*)::int from public.listings l
  where l.status = '出品中' and public.is_enrollment_active(l.seller_id);
$$;
