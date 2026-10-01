-- ===================================================================
-- Migration 11: listings.faculties[] — 学部横断出品（PB-058 Phase 1）
--
-- 目的: 1つの教科書が複数学部で使われる場合、出品者が「使用学部」を複数選んで出品でき、
--       選ばれた各学部の一覧・検索にその出品が並ぶようにする（従来の PB-025＝出品者学部
--       のみ表示 を、教科書の使用学部に応じて広げる）。
--
--   - listings に faculties text[] を追加（この出品が表示される学部の集合）。
--   - 既存行は「出品者の学部のみ」でバックフィル＝従来挙動を完全維持。
--   - 学部絞り込みの読み取り（fetchListingsByFaculty / countActiveListingsByFaculty）は
--     アプリ側で faculties の配列包含に切り替える。RLS は変更不要（学部スコープはRLSではなく
--     クエリ側。listings SELECT ポリシーに学部条件は無い）。
--
-- 適用順序: supabase-setup.sql(#1) → migration-2 → ... → #10 → この #11。
-- ※ Supabase SQL Editor は全体を1トランザクションで実行するため、途中エラーで全ロールバック。
-- ===================================================================

-- 1) 列追加（この出品が表示される学部の集合） --------------------------------------
alter table public.listings add column if not exists faculties text[] not null default '{}';

comment on column public.listings.faculties is
  'この出品が一覧/検索に表示される学部の集合。既定は出品者の学部。ISBN一致した授業の学部を出品者が追加選択できる（PB-058）。';

-- 2) 既存行のバックフィル（従来挙動＝出品者学部のみ を維持） --------------------------
update public.listings l
   set faculties = array[p.faculty]
  from public.profiles p
 where p.id = l.seller_id
   and (l.faculties is null or l.faculties = '{}')
   and p.faculty is not null
   and p.faculty <> '';

-- 3) 配列包含クエリ（faculties @> array[F]）を効かせる GIN インデックス ----------------
create index if not exists listings_faculties_gin on public.listings using gin (faculties);

-- grant は不要：listings は table-level grant（authenticated が INSERT/UPDATE 可）なので
-- 新列は自動で書き込める（profiles/reservations のような列単位 grant は使っていない）。
