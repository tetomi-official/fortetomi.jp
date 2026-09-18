CREATE OR REPLACE FUNCTION "public"."get_newest_listings"("p_limit" integer DEFAULT 4) RETURNS TABLE("id" "uuid", "title" "text", "subject" "text", "price" integer, "image_urls" "text"[], "seller_name" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select l.id, l.title, l.subject, l.price, l.image_urls, p.name, l.created_at
  from public.listings l
  join public.profiles p on p.id = l.seller_id
  where l.status = '出品中' and public.is_enrollment_active(l.seller_id)
  order by l.created_at desc
  limit greatest(0, least(p_limit, 20));
$$;
