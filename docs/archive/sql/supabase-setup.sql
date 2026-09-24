-- ===================================================
-- TETOMI: Supabase 初期セットアップ（#1）
-- Supabase ダッシュボード → SQL Editor に貼り付けて Run。
-- （何度流しても安全なように冪等に書いてある）
--
-- ⚠️ 適用順序：この #1 のあとに必ず supabase-migration-2-profiles-private.sql（#2）を適用すること。
--    #2 は profiles の PII 列を profiles_private へ分離する。
--    #2 適用後に #1 を“単独で”再実行しないこと（PII 列・public_profiles ビューが復活する）。
--    両方流し直す場合は必ず #1 → #2 の順で。
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
-- 在籍確認の有効期限（年度末＝次の4/1 JST）。NULL = 未認証/失効。
-- これを過ぎると出品・購入が停止し、大学メールでの再認証が必要になる。
alter table public.profiles add column if not exists enrollment_valid_until timestamptz;

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

-- 閲覧：本人の行のみ。profiles には大学メール／個人メール（PII）が入っているため、
--   以前の using(true) だと anon key で全学生のメアドが抜けた。本人だけ全列を読める。
--   他人のプロフィール（出品者名・学部など公開してよい情報）は下の public_profiles ビュー経由で読む。
drop policy if exists "profiles are viewable by everyone" on public.profiles;
drop policy if exists "users can view own profile" on public.profiles;
create policy "users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- 更新：本人の行のみ。さらに RLS は「列」を制御できないため、
--   enrollment_valid_until / rating など特権列をユーザーに書かせないよう列レベル権限で制限する
--   （これが無いと、ユーザーが自分の在籍ステータスや評価を自由に書き換えられる＝権限昇格）。
--   enrollment_* の正規更新は service role を使うサーバールートが行う（RLS/列権限をバイパス）。
drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

revoke update on public.profiles from anon, authenticated;
grant  update (name, university, faculty, grade, gender, pending_personal_email)
  on public.profiles to authenticated;

drop policy if exists "users can insert own profile" on public.profiles;
create policy "users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- テーブルレベル権限の是正（Migration 5）：anon は profiles に一切不要
--   （行作成は handle_new_user(SECURITY DEFINER) が行う）。authenticated からは
--   ポリシーの無い DELETE と TRUNCATE/REFERENCES/TRIGGER を剥奪する。
revoke all on public.profiles from anon;
revoke truncate, references, trigger, delete on public.profiles from authenticated;

-- 2.5) 公開プロフィールビュー。出品一覧・出品者カードなど「他人の」プロフィールを
--      表示するための、PII を含まない安全な列だけの読み取り口。
--      security_invoker を付けない（既定）＝ビュー所有者(postgres)権限で実行され
--      profiles の行 RLS をバイパスするが、公開してよい列しか select していないため安全。
create or replace view public.public_profiles as
  select id, name, university, faculty, grade, rating, rating_count, created_at
  from public.profiles;

grant select on public.public_profiles to anon, authenticated;

-- 2.6) 大学メールの重複判定（サインアップの早期エラー用）。
--      profiles は本人行しか見えなくなったため、存在有無の boolean だけを返す
--      SECURITY DEFINER 関数にして、メアド本体は露出させない。
create or replace function public.is_university_email_taken(p_email text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where lower(university_email) = lower(p_email)
  );
$$;

grant execute on function public.is_university_email_taken(text) to anon, authenticated;

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
-- 在籍再認証（年度切替で失効 → 大学メールで再認証）
-- ===================================================

-- 4.5) 在籍が現在有効かを判定する関数。RLS から profiles を横断参照するため
--      SECURITY DEFINER（呼び出し元の権限に依存せず profiles を読む）。
--      出品・購入の insert ポリシーと、出品の閲覧ポリシーで使う。
create or replace function public.is_enrollment_active(uid uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.enrollment_valid_until is not null
      and p.enrollment_valid_until > now()
  );
$$;

-- 4.6) 再認証ワンタイムトークン表。大学メール宛に送ったリンクの検証に使う。
--      クライアントからは触らせない（RLS 有効＋ポリシー無し＝anon/authenticated 不可）。
--      送信・検証は Service Role を使うサーバールートのみが行う（RLS バイパス）。
create table if not exists public.enrollment_reverifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists enrollment_reverif_user_idx
  on public.enrollment_reverifications (user_id, created_at desc);
create index if not exists enrollment_reverif_token_idx
  on public.enrollment_reverifications (token_hash);

alter table public.enrollment_reverifications enable row level security;
-- ポリシーは一切作らない（Service Role のみがアクセスできる）。

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

-- 閲覧：在籍が有効な出品者の出品のみ表示（失効＝卒業生の出品は非表示）。
-- ただし本人は自分の出品が非表示でも確認できるよう常に閲覧可。
drop policy if exists "listings are viewable by everyone" on public.listings;
create policy "listings are viewable by everyone"
  on public.listings for select
  using (public.is_enrollment_active(seller_id) or auth.uid() = seller_id);

-- 作成：本人かつ在籍が有効なときのみ（失効ユーザーは新規出品不可）。
drop policy if exists "users can insert own listings" on public.listings;
create policy "users can insert own listings"
  on public.listings for insert
  with check (auth.uid() = seller_id and public.is_enrollment_active(auth.uid()));

drop policy if exists "users can update own listings" on public.listings;
create policy "users can update own listings"
  on public.listings for update
  using (auth.uid() = seller_id);

drop policy if exists "users can delete own listings" on public.listings;
create policy "users can delete own listings"
  on public.listings for delete
  using (auth.uid() = seller_id);

-- テーブルレベル権限の是正（Supabase 既定の GRANT ALL を絞る）。
--   anon は公開閲覧のみ。authenticated は DML/SELECT を維持（行制御は上記 RLS）。
--   TRUNCATE は RLS 対象外のため anon/authenticated 双方から剥奪する。
grant  select on public.listings to anon;
revoke insert, update, delete, truncate, references, trigger on public.listings from anon;
revoke truncate, references, trigger on public.listings from authenticated;

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

-- アップロードはログイン済みかつ在籍が有効なユーザーのみ（出品の前段で弾く）。
-- かつ保存先フォルダ（先頭セグメント）が自分の uid であることを強制する。
-- これが無いと他人の uid フォルダ名でファイルを置けてしまう（path は uploadListingImages が {uid}/... で作る）。
drop policy if exists "listing images authenticated upload" on storage.objects;
create policy "listing images authenticated upload"
  on storage.objects for insert
  with check (
    bucket_id = 'listing-images'
    and auth.role() = 'authenticated'
    and public.is_enrollment_active(auth.uid())
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "listing images owner update" on storage.objects;
create policy "listing images owner update"
  on storage.objects for update
  using (bucket_id = 'listing-images' and owner = auth.uid());

drop policy if exists "listing images owner delete" on storage.objects;
create policy "listing images owner delete"
  on storage.objects for delete
  using (bucket_id = 'listing-images' and owner = auth.uid());

-- 9) 予約（購入希望）テーブル。買い手が出品に対して購入希望を送る（PB-028/029）。
--    名前・タイトルは読み出し時に listings / profiles を join して取得する。
create table if not exists public.reservations (
  id                 uuid primary key default gen_random_uuid(),
  listing_id         uuid not null references public.listings(id) on delete cascade,
  buyer_id           uuid not null references public.profiles(id) on delete cascade,
  seller_id          uuid not null references public.profiles(id) on delete cascade,
  price              integer not null check (price >= 0),
  preferred_date     text not null,
  preferred_time     text not null,
  preferred_location text not null,
  -- 出品者が提案する代替日程（PB-034 / 機能③）。提案前は null。
  proposed_date      text,
  proposed_time      text,
  proposed_location  text,
  message            text,
  -- 申請中 / 日程調整中 / 承認済み / 完了 / キャンセル
  status             text not null default '申請中',
  created_at         timestamptz not null default now()
);

-- 既存テーブルがある場合の列追加（後から流しても安全に）。
-- create table if not exists は既存テーブルに列を足さないため、初期ドラフトで作った
-- reservations に seller_id 等が無いと、それを参照するポリシーが 42703 で落ちる。
alter table public.reservations add column if not exists listing_id         uuid references public.listings(id) on delete cascade;
alter table public.reservations add column if not exists buyer_id           uuid references public.profiles(id) on delete cascade;
alter table public.reservations add column if not exists seller_id          uuid references public.profiles(id) on delete cascade;
alter table public.reservations add column if not exists price              integer;
alter table public.reservations add column if not exists preferred_date     text;
alter table public.reservations add column if not exists preferred_time     text;
alter table public.reservations add column if not exists preferred_location text;
alter table public.reservations add column if not exists proposed_date      text;
alter table public.reservations add column if not exists proposed_time      text;
alter table public.reservations add column if not exists proposed_location  text;
alter table public.reservations add column if not exists message            text;
alter table public.reservations add column if not exists status             text not null default '申請中';
alter table public.reservations add column if not exists created_at         timestamptz not null default now();

create index if not exists reservations_buyer_idx on public.reservations (buyer_id, created_at desc);
create index if not exists reservations_seller_idx on public.reservations (seller_id, created_at desc);
create index if not exists reservations_listing_idx on public.reservations (listing_id);

-- RLS：買い手・出品者本人のみ閲覧。作成は買い手本人、更新は買い手・出品者（ステータス変更）。
alter table public.reservations enable row level security;

drop policy if exists "reservations viewable by buyer or seller" on public.reservations;
create policy "reservations viewable by buyer or seller"
  on public.reservations for select
  using (auth.uid() = buyer_id or auth.uid() = seller_id);

-- 購入希望の作成：本人かつ在籍が有効なときのみ（失効ユーザーは購入不可）。
drop policy if exists "buyers can insert own reservations" on public.reservations;
create policy "buyers can insert own reservations"
  on public.reservations for insert
  with check (auth.uid() = buyer_id and public.is_enrollment_active(auth.uid()));

-- 更新：買い手・出品者本人のみ。with check で「他人の予約に付け替える」更新を防ぎ、
--   さらに列レベル権限で status 以外（price / 相手 id / 希望条件）を書き換えられないようにする。
drop policy if exists "buyer or seller can update reservation" on public.reservations;
create policy "buyer or seller can update reservation"
  on public.reservations for update
  using (auth.uid() = buyer_id or auth.uid() = seller_id)
  with check (auth.uid() = buyer_id or auth.uid() = seller_id);

--   status に加え proposed_*（代替日程）も更新可能にする。買い手が proposed_* を
--   書き換える不正は validate_reservation_update トリガーで防ぐ。
revoke update on public.reservations from anon, authenticated;
grant  update (status, proposed_date, proposed_time, proposed_location)
  on public.reservations to authenticated;

-- テーブルレベル権限の是正（Migration 5）：anon は予約に一切不要。
--   authenticated は SELECT/INSERT + 上記の列レベルUPDATE のみ。
--   ポリシーの無い DELETE と TRUNCATE/REFERENCES/TRIGGER を剥奪する。
revoke all on public.reservations from anon;
revoke truncate, references, trigger, delete on public.reservations from authenticated;

-- 予約の整合性チェック：seller_id / price が実在する「出品中」のリスティングと一致することを強制。
--   これが無いと、買い手がクライアントから任意の seller_id / price を送り、
--   無関係な人へ偽の購入希望を送ったり価格を詐称できる。
--   RLS の with check はサブクエリ内で挿入行の列を曖昧さなく参照できないため、
--   BEFORE INSERT トリガー（NEW.* で明示参照）で検証する。
create or replace function public.validate_reservation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- seller_id / price が実在する listing と一致することだけを担保する（なりすまし・価格詐称の防止）。
  -- 「出品中のものにしか申請できない」はアプリ層（購入ボタンの出し分け）で担保する。
  -- ここで status='出品中' を強制すると、承認済み予約（listing が予約済み/完了へ遷移後）を
  -- 表現できず、seed や正常な状態遷移と両立しないため含めない。
  if not exists (
    select 1 from public.listings l
    where l.id        = new.listing_id
      and l.seller_id = new.seller_id
      and l.price     = new.price
  ) then
    raise exception 'reservation does not match its listing (listing_id/seller_id/price mismatch)';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_reservation_before_insert on public.reservations;
create trigger validate_reservation_before_insert
  before insert on public.reservations
  for each row execute function public.validate_reservation();

-- 更新時の整合性：proposed_*（代替日程）は出品者本人のみ書き換え可能（PB-034 / 機能③）。
--   買い手による日程詐称を防ぐ。status のみの更新（買い手の承諾等）は誰でも通る。
create or replace function public.validate_reservation_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (new.proposed_date     is distinct from old.proposed_date
   or new.proposed_time     is distinct from old.proposed_time
   or new.proposed_location is distinct from old.proposed_location)
   and auth.uid() <> old.seller_id then
    raise exception 'only the seller can propose a reschedule';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_reservation_before_update on public.reservations;
create trigger validate_reservation_before_update
  before update on public.reservations
  for each row execute function public.validate_reservation_update();

-- トリガー専用関数の RPC 公開を遮断（Migration 7）。
--   既定で PUBLIC に付く EXECUTE を外し、/rest/v1/rpc/<fn> から呼べないようにする。
--   トリガーの発火は呼び出しロールの EXECUTE 権限に依存しないため動作に影響しない。
revoke execute on function public.handle_new_user()            from public, anon, authenticated;
revoke execute on function public.enforce_email_domain()       from public, anon, authenticated;
revoke execute on function public.validate_reservation()       from public, anon, authenticated;
revoke execute on function public.validate_reservation_update() from public, anon, authenticated;
