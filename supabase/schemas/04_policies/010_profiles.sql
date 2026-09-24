ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles viewable by authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));

CREATE POLICY "users can update own profile" ON "public"."profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));

-- ログインしていない人にも、出品者の情報を見せる（出品一覧・詳細をログインなしで見られるように）。
-- 見せる相手は「今見えている出品の出品者」だけ。出品していない人や、在籍が切れて出品が
-- 見えなくなった人は見せない（中の listings の読み取りにも、listings の閲覧ルールが効くため）。
-- 見せる列は 09_grants/010_profiles.sql で名前・学部・学年・評価に絞っている。
CREATE POLICY "sellers with visible listings are viewable by anyone" ON "public"."profiles" FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE ("l"."seller_id" = "profiles"."id"))));
