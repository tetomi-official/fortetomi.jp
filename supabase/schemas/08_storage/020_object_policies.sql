-- listing-images への書き込みルール（storage.objects のポリシー）。
--
-- ここも supabase db diff の対象外（storage スキーマのため）。手で当てる。
-- 読み取り(SELECT)のポリシーは意図的に無い：表示は公開URL経由で足り、
-- ポリシーを置くとファイル名の一覧が取れてしまうため（docs/supabase-migration-2）。
-- アップロードは「自分のIDのフォルダにだけ」「在籍中の人だけ」に絞っている。

CREATE POLICY "listing images authenticated upload" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'listing-images'::"text") AND ("auth"."role"() = 'authenticated'::"text") AND "public"."is_enrollment_active"("auth"."uid"()) AND (("storage"."foldername"("name"))[1] = ("auth"."uid"())::"text")));

CREATE POLICY "listing images owner delete" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'listing-images'::"text") AND ("owner" = "auth"."uid"())));

CREATE POLICY "listing images owner update" ON "storage"."objects" FOR UPDATE USING ((("bucket_id" = 'listing-images'::"text") AND ("owner" = "auth"."uid"())));
