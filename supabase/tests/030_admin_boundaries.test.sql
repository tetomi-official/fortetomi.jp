-- 運営の取引一覧（/admin）の境界。#60
--
-- 見せない側だけだと「塞ぎすぎ」に気づけないので、ここでも両側を確かめる。
--   ・運営でない人・ログインしていない人には、他人の取引が見えないこと
--   ・運営には見えること。とくに「卒業した出品者の取引」が消えないこと
--   ・自分で自分を運営にできないこと
begin;
\ir _helpers/helpers.psql
select plan(21);

-- ---- 準備 ----
-- A(出品者) と B(買い手) が取引中。C は無関係。D は卒業した出品者で E(買い手) と取引した。
-- M は運営で、どの取引の当事者でもない。
select pg_temp.make_user('aaaaaaaa-6060-0000-0000-000000000001', 'admin-a@g.chuo-u.ac.jp', '出品者A');
select pg_temp.make_user('bbbbbbbb-6060-0000-0000-000000000002', 'admin-b@g.chuo-u.ac.jp', '買い手B');
select pg_temp.make_user('cccccccc-6060-0000-0000-000000000003', 'admin-c@g.chuo-u.ac.jp', '無関係C');
select pg_temp.make_user('dddddddd-6060-0000-0000-000000000004', 'admin-d@g.chuo-u.ac.jp', '卒業生D', false);
select pg_temp.make_user('eeeeeeee-6060-0000-0000-000000000005', 'admin-e@g.chuo-u.ac.jp', '買い手E');
select pg_temp.make_user('ffffffff-6060-0000-0000-000000000006', 'admin-m@g.chuo-u.ac.jp', '運営M');
select pg_temp.make_admin('ffffffff-6060-0000-0000-000000000006');

select pg_temp.make_listing('11111111-6060-0000-0000-000000000001', 'aaaaaaaa-6060-0000-0000-000000000001');
select pg_temp.make_listing('11111111-6060-0000-0000-000000000004', 'dddddddd-6060-0000-0000-000000000004');
select pg_temp.make_reservation('22222222-6060-0000-0000-000000000001',
  '11111111-6060-0000-0000-000000000001', 'bbbbbbbb-6060-0000-0000-000000000002');
select pg_temp.make_reservation('22222222-6060-0000-0000-000000000004',
  '11111111-6060-0000-0000-000000000004', 'eeeeeeee-6060-0000-0000-000000000005');

-- =========================================================
-- ログインしていない人
-- =========================================================
select pg_temp.as_anon();

select is(
  pg_temp.try_count($q$ select 1 from public.admin_reservations $q$),
  -1, 'ログインなし：運営の一覧（view）はそもそも読めない');
-- 関数は try_count では確かめられない。count(*) は値を使わないので、
-- プランナが関数の呼び出し自体を落としてしまい、権限が見られないまま通ってしまう。
select throws_ok(
  $$ select public.is_admin() $$,
  '42501',
  null,
  'ログインなし：is_admin() は呼べない');
-- 塞ぎすぎていないか。運営用のポリシーを足したせいで、今まで見えていたものが
-- 見えなくなっていないことを確かめる（2026-09-18 の is_enrollment_active の件と同じ趣旨）。
select is(
  pg_temp.try_count($q$ select 1 from public.listings
                        where id = '11111111-6060-0000-0000-000000000001' $q$),
  1, 'ログインなし：在籍中の人の出品は今までどおり見える');

-- =========================================================
-- 運営でない利用者（無関係C）
-- =========================================================
select pg_temp.as_user('cccccccc-6060-0000-0000-000000000003');

select is(
  pg_temp.try_count($q$ select 1 from public.reservations $q$),
  0, '運営でない人：他人の取引は1件も見えない');
select is(
  pg_temp.try_count($q$ select 1 from public.admin_reservations $q$),
  0, '運営でない人：view を直に叩いても 0 件');
-- 自分で自分を運営にする（列の UPDATE 権限が無いので弾かれる）
select throws_ok(
  $$ update public.profiles set is_admin = true
      where id = 'cccccccc-6060-0000-0000-000000000003' $$,
  '42501',
  null,
  '運営でない人：自分を運営に書き換えられない');

-- =========================================================
-- 取引の当事者（買い手B）— 今までどおり自分の取引は見える
-- =========================================================
select pg_temp.as_user('bbbbbbbb-6060-0000-0000-000000000002');

select is(
  pg_temp.try_count($q$ select 1 from public.reservations
                        where id = '22222222-6060-0000-0000-000000000001' $q$),
  1, '買い手：自分の取引は今までどおり見える');
select is(
  pg_temp.try_count($q$ select 1 from public.admin_reservations $q$),
  0, '買い手：運営ではないので view は 0 件（自分の取引も出さない）');

-- =========================================================
-- 運営M
-- =========================================================
select pg_temp.as_user('ffffffff-6060-0000-0000-000000000006');

select ok(public.is_admin(), '運営：is_admin() が true を返す');
select is(
  pg_temp.try_count($q$ select 1 from public.reservations
                        where id = '22222222-6060-0000-0000-000000000001' $q$),
  1, '運営：当事者でない取引も見える');
-- seed のデータも入っているので、このテストで作った2件に絞って数える。
select is(
  pg_temp.try_count($q$ select 1 from public.admin_reservations
                        where id in ('22222222-6060-0000-0000-000000000001',
                                     '22222222-6060-0000-0000-000000000004') $q$),
  2, '運営：view に取引が2件とも出る');
-- 卒業した出品者の取引。listings に運営用のポリシーを足していないと、
-- 出品が見えず join で落ちてこの行が一覧から消える。
select is(
  pg_temp.try_count($q$ select 1 from public.admin_reservations
                        where id = '22222222-6060-0000-0000-000000000004' $q$),
  1, '運営：卒業した出品者の取引も一覧から消えない');
select is(
  (select search_text from public.admin_reservations
    where id = '22222222-6060-0000-0000-000000000001'),
  'テスト用の教科書 買い手B 出品者A',
  '運営：検索用の文字列に教科書名と両者の名前が入っている');

-- =========================================================
-- 権限そのもの（画面やポリシーを通さずに、GRANT の形を直接見る）
-- =========================================================
select pg_temp.as_admin();

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE'),
  'GRANT：authenticated に is_admin の UPDATE 権限が無い');
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'INSERT'),
  'GRANT：authenticated に is_admin の INSERT 権限が無い（insert でも立てられない）');

-- =========================================================
-- 運営のメールアドレス（#60）
--   運営は学生ではないので大学メールを持たない。会員登録の入口は
--   @g.chuo-u.ac.jp のままにして、決め打ちのアドレスだけを例外で通す。
-- =========================================================

-- seed が同じアドレスの運営をすでに作っている。ここではトリガーが立てるところを
-- 見たいので、いったん消してから作り直す。このテスト全体は transaction の中なので、
-- 最後の rollback で seed の行は元に戻る。
delete from auth.users where email = 'tetomitextbook@gmail.com';

select lives_ok(
  $$ select pg_temp.make_user('ffffffff-6060-0000-0000-00000000000a',
       'tetomitextbook@gmail.com', '運営スタッフ') $$,
  '運営のアドレスは、大学ドメインでなくてもアカウントを作れる');

-- 作った瞬間に運営になっていること。is_admin は誰も UPDATE できない列なので、
-- 行を作るトリガー（handle_new_user）で決めないと、あとから立てる手段がない。
select is(
  (select is_admin from public.profiles where id = 'ffffffff-6060-0000-0000-00000000000a'),
  true, '運営のアドレスなら、アカウントを作った時点で運営になる');

select throws_ok(
  $$ select pg_temp.make_user('ffffffff-6060-0000-0000-00000000000b',
       'dare-demo@gmail.com', '部外者') $$,
  'P0001',
  null,
  '運営でない外部のアドレスは、今までどおり弾かれる（入口は広がっていない）');

-- 塞ぎすぎ／開けすぎの両方を見る。ふつうの学生が運営になっていないこと。
select is(
  (select is_admin from public.profiles where id = 'aaaaaaaa-6060-0000-0000-000000000001'),
  false, '大学メールで作った人は運営にならない');

-- 本番の運営アカウントは Supabase のダッシュボードから作るので、名前を入れる欄が無い。
-- そのときでも名無しにならないこと。ここでは名前の無い（'{}'）アカウントを直に作る。
delete from auth.users where email = 'tetomitextbook@gmail.com';
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000',
  'ffffffff-6060-0000-0000-00000000000c',
  'authenticated', 'authenticated', 'tetomitextbook@gmail.com', '',
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}',
  '', '', '', ''
);

select is(
  (select name from public.profiles where id = 'ffffffff-6060-0000-0000-00000000000c'),
  '運営 スタッフ', '名前を渡さなくても、運営には既定の名前が入る');

select is(
  (select is_admin from public.profiles where id = 'ffffffff-6060-0000-0000-00000000000c'),
  true, '名前を渡さなくても、運営フラグは立つ');

select * from finish();
rollback;
