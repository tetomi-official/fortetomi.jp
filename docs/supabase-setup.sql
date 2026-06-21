-- ===================================================
-- TETOMI: Supabase 初期セットアップ
-- Supabase ダッシュボード → SQL Editor に貼り付けて Run。
-- （何度流しても安全なように冪等に書いてある）
-- ===================================================

-- 1) プロフィールテーブル（auth.users と 1:1 で紐付く）
create table if not exists public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  name                   text,
  university             text,
  faculty                text,
  grade                  text,
  gender                 text,
  -- 在籍確認に使った大学メール（@g.chuo-u.ac.jp）。監査用の記録として保持。
  university_email       text,
  -- 登録時に入力された個人メール。確認完了後にログインIDへ昇格させる「予約」。
  pending_personal_email text,
  -- 大学メールの確認が完了したか（在籍証明済みフラグ）
  enrollment_verified    boolean not null default false,
  rating                 numeric  not null default 5,
  rating_count           integer  not null default 0,
  created_at             timestamptz not null default now()
);

-- 既存テーブルがある場合のカラム追加（後から流しても安全に）
alter table public.profiles add column if not exists gender                 text;
alter table public.profiles add column if not exists university_email       text;
alter table public.profiles add column if not exists pending_personal_email text;
alter table public.profiles add column if not exists enrollment_verified    boolean not null default false;

-- 1.5) 同一大学メールでの複数登録を防止（在籍担保の要）。
--    方針B では確認完了後に auth.users.email が個人メールへ置き換わり、
--    大学メールは profiles.university_email にしか残らないため、
--    auth.users 側の一意制約だけでは大学メールの重複を防げない。
--    ここで大学メール（大文字小文字を無視）に部分ユニーク制約を張るのが最終防御。
--    handle_new_user は AFTER INSERT で profiles に行を作るので、
--    重複時はこの INSERT が失敗 →（同一トランザクションの）auth.users INSERT ごと巻き戻る。
create unique index if not exists profiles_university_email_uniq
  on public.profiles (lower(university_email))
  where university_email is not null;

-- 2) RLS（行レベルセキュリティ）を有効化
--    これを ON にしないと anon key で全行アクセスされる。
alter table public.profiles enable row level security;

drop policy if exists "profiles are viewable by everyone" on public.profiles;
create policy "profiles are viewable by everyone"
  on public.profiles for select
  using (true);

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "users can insert own profile" on public.profiles;
create policy "users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 3) 新規ユーザー登録時に profiles 行を自動作成するトリガー
--    signUp の options.data（user metadata）から値を取り込む。
--    この時点では auth.users.email = 大学メール。
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id, name, university, faculty, grade, gender,
    university_email, pending_personal_email
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'university',
    new.raw_user_meta_data ->> 'faculty',
    new.raw_user_meta_data ->> 'grade',
    new.raw_user_meta_data ->> 'gender',
    new.email,                                       -- 大学メールを記録
    new.raw_user_meta_data ->> 'personal_email'      -- 後でログインIDへ昇格
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) 在籍担保：許可ドメイン以外のメールでの「新規登録」をサーバー側で拒否する。
--    フロントのチェックは回避できるため、ここが最終防御。
--    ※ BEFORE INSERT のみ。後で個人メールへ変更（UPDATE）するのは許可される。
--    ※許可ドメインを変えるときは lib/constants.ts も合わせて更新すること。
create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if split_part(lower(new.email), '@', 2) <> 'g.chuo-u.ac.jp' then
    raise exception 'email domain not allowed: signup must use @g.chuo-u.ac.jp';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_email_domain_before_insert on auth.users;
create trigger enforce_email_domain_before_insert
  before insert on auth.users
  for each row execute function public.enforce_email_domain();

-- ===================================================
-- 出品（listings）
-- ===================================================

-- 5) 出品テーブル。出品者は profiles（= auth.users）に紐付く。
--    画像は Supabase Storage に保存し、ここには公開URLの配列だけ持つ。
create table if not exists public.listings (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  subject          text not null,
  author           text,
  publisher        text,
  isbn             text,
  publication_year text,
  description      text,
  -- カテゴリは現状「教科書」固定（PB-017）。将来拡張できるよう列で保持。
  category         text not null default '教科書',
  condition        text not null,
  price            integer not null check (price >= 0),
  location         text not null,
  -- Storage の公開URL配列（先頭=メイン画像）。
  image_urls       text[] not null default '{}',
  seller_id        uuid not null references public.profiles(id) on delete cascade,
  status           text not null default '出品中',
  views            integer not null default 0,
  likes            integer not null default 0,
  created_at       timestamptz not null default now()
);

create index if not exists listings_seller_id_idx on public.listings (seller_id);
create index if not exists listings_status_created_idx on public.listings (status, created_at desc);

-- 6) RLS：閲覧は全員、作成・更新・削除は本人（出品者）のみ。
alter table public.listings enable row level security;

drop policy if exists "listings are viewable by everyone" on public.listings;
create policy "listings are viewable by everyone"
  on public.listings for select
  using (true);

drop policy if exists "users can insert own listings" on public.listings;
create policy "users can insert own listings"
  on public.listings for insert
  with check (auth.uid() = seller_id);

drop policy if exists "users can update own listings" on public.listings;
create policy "users can update own listings"
  on public.listings for update
  using (auth.uid() = seller_id);

drop policy if exists "users can delete own listings" on public.listings;
create policy "users can delete own listings"
  on public.listings for delete
  using (auth.uid() = seller_id);

-- 7) 出品画像用の Storage バケット（公開読み取り）。
insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true)
on conflict (id) do nothing;

-- 8) Storage ポリシー：読み取りは全員、アップロードはログインユーザー、
--    更新・削除は所有者のみ。
drop policy if exists "listing images public read" on storage.objects;
create policy "listing images public read"
  on storage.objects for select
  using (bucket_id = 'listing-images');

drop policy if exists "listing images authenticated upload" on storage.objects;
create policy "listing images authenticated upload"
  on storage.objects for insert
  with check (bucket_id = 'listing-images' and auth.role() = 'authenticated');

drop policy if exists "listing images owner update" on storage.objects;
create policy "listing images owner update"
  on storage.objects for update
  using (bucket_id = 'listing-images' and owner = auth.uid());

drop policy if exists "listing images owner delete" on storage.objects;
create policy "listing images owner delete"
  on storage.objects for delete
  using (bucket_id = 'listing-images' and owner = auth.uid());
