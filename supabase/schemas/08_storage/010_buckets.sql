-- 画像の置き場（バケット）。
--
-- バケットは「設計図」ではなく storage.buckets の行（データ）なので、
-- supabase db diff の差分には出てこない。本番へ反映するときは手で当てる。
--
-- public = true：画像は公開URLで表示する。ただし一覧（ファイル名の列挙）は
-- 読み取りポリシーを置かないことで塞いでいる（docs/supabase-migration-2 の判断）。

insert into "storage"."buckets" ("id", "name", "public")
values ('listing-images', 'listing-images', true)
on conflict ("id") do nothing;
