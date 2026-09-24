-- ============================================================================
-- TETOMI マイグレーション #2：PII 分離（profiles_private）＋ 公開閲覧の RPC 化（案A）
--                          ＋ get_advisors 由来のセキュリティ/性能ハードニング
--
-- 適用：Supabase ダッシュボード → SQL Editor に全文貼り付けて Run。
-- 冪等：何度流しても同じ最終状態になる（列移送 → 列削除の順序を保証）。
-- 前提：supabase-setup.sql（#1）が適用済みであること。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) PII テーブル profiles_private（本人のみアクセス可）
-- ----------------------------------------------------------------------------
create table if not exists public.profiles_private (
  id                     uuid primary key references public.profiles(id) on delete cascade,
  university_email       text,
  pending_personal_email text,
  gender                 text
);

alter table public.profiles_private enable row level security;

drop policy if exists "own private read" on public.profiles_private;
create policy "own private read"
  on public.profiles_private for select
  using ((select auth.uid()) = id);

drop policy if exists "own private update" on public.profiles_private;
create policy "own private update"
  on public.profiles_private for update
  using ((select auth.uid()) = id);

drop policy if exists "own private insert" on public.profiles_private;
create policy "own private insert"
  on public.profiles_private for insert
  with check ((select auth.uid()) = id);

-- 本人(authenticated)のみ閲覧。anon は完全遮断。更新は gender のみ
-- （大学メール・個人メールはユーザーから書き換え不可。enrollment 系は profiles 側で service role 管理）。
revoke select on public.profiles_private from anon;
revoke update on public.profiles_private from anon, authenticated;
grant  update (gender) on public.profiles_private to authenticated;

-- ----------------------------------------------------------------------------
-- B) 既存データを移送 → 一意制約を private 側へ → profiles から PII 列を削除
--    （列がまだ存在する初回のみ移送する。再実行時は列が無いのでスキップ＝冪等）
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'university_email'
  ) then
    insert into public.profiles_private (id, university_email, pending_personal_email, gender)
    select id, university_email, pending_personal_email, gender
    from public.profiles
    on conflict (id) do nothing;
  end if;
end $$;

drop index if exists public.profiles_university_email_uniq;
create unique index if not exists profiles_private_university_email_uniq
  on public.profiles_private (lower(university_email))
  where university_email is not null;

alter table public.profiles drop column if exists university_email;
alter table public.profiles drop column if exists pending_personal_email;
alter table public.profiles drop column if exists gender;

-- ----------------------------------------------------------------------------
-- C) public_profiles ビュー廃止（Security Definer View ERROR を解消）
--    profiles は PII を持たない「公開安全」テーブルになったので、
--    ログイン済みユーザーは他人の行も閲覧できる（出品者名・学部の結合用）。anon は遮断。
-- ----------------------------------------------------------------------------
drop view if exists public.public_profiles;

drop policy if exists "profiles are viewable by everyone" on public.profiles;
drop policy if exists "users can view own profile" on public.profiles;
drop policy if exists "profiles viewable by authenticated" on public.profiles;
create policy "profiles viewable by authenticated"
  on public.profiles for select to authenticated
  using (true);

revoke select on public.profiles from anon;

-- 更新は本人行のみ＋列レベル制限（gender は private へ移動済み）
drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
  on public.profiles for update
  using ((select auth.uid()) = id);
revoke update on public.profiles from anon, authenticated;
grant  update (name, university, faculty, grade) on public.profiles to authenticated;

drop policy if exists "users can insert own profile" on public.profiles;
create policy "users can insert own profile"
  on public.profiles for insert
  with check ((select auth.uid()) = id);

-- ----------------------------------------------------------------------------
-- D) トリガーを2テーブル書き込みに / 重複判定を private 参照に
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, university, faculty, grade)
  values (
    new.id,
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'university',
    new.raw_user_meta_data ->> 'faculty',
    new.raw_user_meta_data ->> 'grade'
  );
  insert into public.profiles_private (id, university_email, pending_personal_email, gender)
  values (
    new.id,
    new.email,                                  -- 大学メール
    new.raw_user_meta_data ->> 'personal_email',
    new.raw_user_meta_data ->> 'gender'
  );
  return new;
end;
$$;

create or replace function public.is_university_email_taken(p_email text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles_private
    where lower(university_email) = lower(p_email)
  );
$$;
grant execute on function public.is_university_email_taken(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- E) 案A：listings / reservations を anon 遮断（ログイン必須ブラウズ）
--    + LP 用の公開安全 RPC（件数・新着のみ。未ログインでも数字を出せる）
-- ----------------------------------------------------------------------------
revoke select on public.listings     from anon;
revoke select on public.reservations from anon;

create or replace function public.count_active_listings()
returns integer
language sql
security definer set search_path = public
stable
as $$
  select count(*)::int from public.listings l
  where l.status = '出品中' and public.is_enrollment_active(l.seller_id);
$$;

create or replace function public.get_newest_listings(p_limit int default 4)
returns table (
  id uuid, title text, subject text, price int,
  image_urls text[], seller_name text, created_at timestamptz
)
language sql
security definer set search_path = public
stable
as $$
  select l.id, l.title, l.subject, l.price, l.image_urls, p.name, l.created_at
  from public.listings l
  join public.profiles p on p.id = l.seller_id
  where l.status = '出品中' and public.is_enrollment_active(l.seller_id)
  order by l.created_at desc
  limit greatest(0, least(p_limit, 20));
$$;

grant execute on function public.count_active_listings()  to anon, authenticated;
grant execute on function public.get_newest_listings(int) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- F) 性能：RLS 内の auth.uid() を (select auth.uid()) にして行ごと再評価を防ぐ
--    （listings / reservations の全ポリシーを貼り直し。profiles は上で対応済み）
-- ----------------------------------------------------------------------------
drop policy if exists "listings are viewable by everyone" on public.listings;
create policy "listings are viewable by everyone"
  on public.listings for select
  using (public.is_enrollment_active(seller_id) or (select auth.uid()) = seller_id);

drop policy if exists "users can insert own listings" on public.listings;
create policy "users can insert own listings"
  on public.listings for insert
  with check ((select auth.uid()) = seller_id and public.is_enrollment_active((select auth.uid())));

drop policy if exists "users can update own listings" on public.listings;
create policy "users can update own listings"
  on public.listings for update
  using ((select auth.uid()) = seller_id);

drop policy if exists "users can delete own listings" on public.listings;
create policy "users can delete own listings"
  on public.listings for delete
  using ((select auth.uid()) = seller_id);

drop policy if exists "reservations viewable by buyer or seller" on public.reservations;
create policy "reservations viewable by buyer or seller"
  on public.reservations for select
  using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id);

drop policy if exists "buyers can insert own reservations" on public.reservations;
create policy "buyers can insert own reservations"
  on public.reservations for insert
  with check ((select auth.uid()) = buyer_id and public.is_enrollment_active((select auth.uid())));

drop policy if exists "buyer or seller can update reservation" on public.reservations;
create policy "buyer or seller can update reservation"
  on public.reservations for update
  using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id)
  with check ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id);

-- ----------------------------------------------------------------------------
-- G) トリガー専用関数を REST/GraphQL の RPC 面から外す（発火に EXECUTE は不要）。
--    ※ 関数は既定で PUBLIC に EXECUTE が付くため、public からも剥奪しないと
--      anon/authenticated は PUBLIC 経由で実行できてしまう。
-- ----------------------------------------------------------------------------
revoke execute on function public.handle_new_user()      from public, anon, authenticated;
revoke execute on function public.enforce_email_domain()  from public, anon, authenticated;
revoke execute on function public.validate_reservation()  from public, anon, authenticated;

-- is_enrollment_active は RLS 評価で authenticated だけが必要（anon は listings を読めないため不要）。
-- 定義者(owner)権限で動く RPC からの内部呼び出しは EXECUTE 不要なので、authenticated のみに絞る。
revoke execute on function public.is_enrollment_active(uuid) from public, anon;
grant  execute on function public.is_enrollment_active(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- H) enrollment_reverifications は Service Role 専用 → anon/authenticated 全剥奪
-- ----------------------------------------------------------------------------
revoke all on table public.enrollment_reverifications from anon, authenticated;

-- ----------------------------------------------------------------------------
-- I) Storage：公開バケットの広い SELECT ポリシー削除（全ファイル列挙を防止。
--    画像表示は getPublicUrl の公開URL経由なので影響なし）
-- ----------------------------------------------------------------------------
drop policy if exists "listing images public read" on storage.objects;
