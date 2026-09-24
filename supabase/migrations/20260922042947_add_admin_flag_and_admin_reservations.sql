SET local check_function_bodies = off;

ALTER TABLE "public"."profiles"
  ADD COLUMN "is_admin" boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_admin
  );
$function$;

CREATE VIEW "public"."admin_reservations" WITH (security_invoker=true) AS  SELECT r.id,
    r.status,
    r.created_at,
    r.price,
    r.listing_id,
    l.title AS listing_title,
    l.status AS listing_status,
    r.buyer_id,
    bp.name AS buyer_name,
    bp.faculty AS buyer_faculty,
    bp.grade AS buyer_grade,
    r.seller_id,
    sp.name AS seller_name,
    sp.faculty AS seller_faculty,
    sp.grade AS seller_grade,
    r.preferred_date,
    r.preferred_time,
    r.preferred_location,
    r.proposed_date,
    r.proposed_time,
    r.proposed_location,
    r.candidate_slots,
    r.selected_slot,
    r.paid_at,
    r.payment_provider,
    r.payment_status,
    r.payment_error_code,
    concat_ws(' '::text, l.title, bp.name, sp.name) AS search_text
   FROM (((public.reservations r
     JOIN public.listings l ON ((l.id = r.listing_id)))
     JOIN public.profiles bp ON ((bp.id = r.buyer_id)))
     JOIN public.profiles sp ON ((sp.id = r.seller_id)))
  WHERE public.is_admin();

CREATE POLICY "admins can read all listings" ON "public"."listings"
  FOR SELECT
  TO "authenticated"
  USING (public.is_admin());

CREATE POLICY "admins can read all reservations" ON "public"."reservations"
  FOR SELECT
  TO "authenticated"
  USING (public.is_admin());

COMMENT ON COLUMN "public"."profiles"."is_admin" IS '運営かどうか。運営だけが取引一覧（/admin）を見られる。本人に書き換えられないよう、authenticated には UPDATE(is_admin) を付けない（09_grants/010_profiles.sql）。立てるのは migration からだけ。';

-- ▼ anon を手で足した（db-workflow.md 3章 (a)）。関数を作ると Supabase が anon にも
-- EXECUTE を付けるが、差分ツールははがす文を出さない（実際に pgTAP で検出）。
-- この関数を呼ぶポリシーはすべて TO authenticated なので、anon から外しても
-- ログインなしの出品一覧には影響しない（030_admin_boundaries.test.sql で確認）。
REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC, "anon";

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "authenticated", "postgres", "service_role";

-- ▼ 手で並べ替えた（docs/operations/db-workflow.md 3章 (b)）。
-- 差分ツールは「列ごとに付ける」→「テーブルごとはがす」の順で出してくる。
-- そのまま流すと最後の REVOKE で列の権限まで消える。はがすのを先、付けるのを後にする。
REVOKE ALL ON TABLE "public"."profiles" FROM "authenticated";

GRANT MAINTAIN, SELECT ON TABLE "public"."profiles" TO "authenticated";

GRANT INSERT ("id") ON TABLE "public"."profiles" TO "authenticated";

GRANT INSERT ("name"), UPDATE ("name") ON TABLE "public"."profiles" TO "authenticated";

GRANT INSERT ("university"), UPDATE ("university") ON TABLE "public"."profiles" TO "authenticated";

GRANT INSERT ("faculty"), UPDATE ("faculty") ON TABLE "public"."profiles" TO "authenticated";

GRANT INSERT ("grade"), UPDATE ("grade") ON TABLE "public"."profiles" TO "authenticated";

-- ▼ 手で足した（同 3章 (a)）。view を作ると Supabase が anon にも権限を付けるが、
-- 差分ツールははがす文を出さない。運営用の view なので anon には一切残さない。
REVOKE ALL ON TABLE "public"."admin_reservations" FROM "anon", "authenticated";

GRANT SELECT ON TABLE "public"."admin_reservations" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admin_reservations" TO "postgres", "service_role";
