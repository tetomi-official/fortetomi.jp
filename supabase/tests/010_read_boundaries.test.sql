-- 「読ませない」と「見せる」の境界。
--
-- 見せない側だけを確かめると、塞ぎすぎて正しい画面が壊れたことに気づけない。
-- 実際に 2026-09-18、is_enrollment_active を anon から外したせいで
-- ログインしていない人の出品一覧が空になった。なので両側を確かめる。
begin;
\ir _helpers/helpers.psql
select plan(35);

-- ---- 準備：A と B が取引中、C は無関係、D は在籍切れ ----
select pg_temp.make_user('aaaaaaaa-0000-0000-0000-000000000001', 'test-a@g.chuo-u.ac.jp', '出品者A');
select pg_temp.make_user('bbbbbbbb-0000-0000-0000-000000000002', 'test-b@g.chuo-u.ac.jp', '買い手B');
select pg_temp.make_user('cccccccc-0000-0000-0000-000000000003', 'test-c@g.chuo-u.ac.jp', '無関係C');
select pg_temp.make_user('dddddddd-0000-0000-0000-000000000004', 'test-d@g.chuo-u.ac.jp', '卒業生D', false);
select pg_temp.make_listing('11111111-aaaa-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.make_listing('11111111-dddd-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000004');
select pg_temp.make_reservation('22222222-abab-0000-0000-000000000001',
  '11111111-aaaa-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
insert into public.messages (reservation_id, sender_id, body)
  values ('22222222-abab-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'よろしくお願いします');
insert into public.connect_accounts (user_id, stripe_account_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'acct_test_secret');
insert into public.payment_customers (user_id, provider, stripe_customer_id)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'stripe', 'cus_test_secret');
insert into public.syllabus_courses (id, course_name, faculty) values (990001, 'テスト用の授業', '経済学部');
insert into public.syllabus_textbooks (course_id, isbn13) values (990001, '9780000000001');

-- =========================================================
-- ログインしていない人
-- =========================================================
select pg_temp.as_anon();

-- 見せる
select is(
  pg_temp.try_count($q$ select 1 from public.listings where id = '11111111-aaaa-0000-0000-000000000001' $q$),
  1, 'ログインなし：在籍中の人の出品は見える（出品一覧が空にならない）');
select is(
  pg_temp.try_count($q$ select 1 from public.listings where id = '11111111-dddd-0000-0000-000000000004' $q$),
  0, 'ログインなし：在籍切れの人の出品は見えない');
select lives_ok($$ select public.count_active_listings() $$,
  'ログインなし：トップの出品数カウンタは呼べる');
select lives_ok($$ select * from public.get_newest_listings(4) $$,
  'ログインなし：トップの新着一覧は呼べる');
select lives_ok($$ select public.is_university_email_taken('x@g.chuo-u.ac.jp') $$,
  'ログインなし：登録画面のメール重複チェックは呼べる');

select is(
  pg_temp.try_count($q$ select c.course_name from public.syllabus_textbooks t
                        join public.syllabus_courses c on c.id = t.course_id
                        where t.isbn13 = '9780000000001' $q$),
  1, 'ログインなし：詳細の「この本を使う授業」を読める（シラバス）');

-- 見せない
select throws_ok($$ insert into public.syllabus_courses (id, course_name) values (990002, '改ざん') $$,
  '42501', null, 'ログインなし：シラバスは書き換えられない');
select throws_ok($$ select * from public.profiles $$, '42501', null,
  'ログインなし：プロフィールを全部の列では読めない（在籍期限などは渡さない）');
select throws_ok($$ select enrollment_valid_until from public.profiles $$, '42501', null,
  'ログインなし：在籍期限の列は読めない');

-- 出品者の情報（出品一覧・詳細をログインなしで見られるように）
select is(
  pg_temp.try_count($q$ select l.id, p.name from public.listings l
                        join public.profiles p on p.id = l.seller_id
                        where l.id = '11111111-aaaa-0000-0000-000000000001' $q$),
  1, 'ログインなし：出品と出品者名を一緒に読める（一覧・詳細の読み方）');
select lives_ok($$ select id, name, faculty, grade, rating, rating_count from public.profiles
                   where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  'ログインなし：詳細の出品者欄（名前・学部・学年・評価）を読める');
select is(
  pg_temp.try_count($q$ select 1 from public.profiles where id = 'cccccccc-0000-0000-0000-000000000003' $q$),
  0, 'ログインなし：出品していない人のプロフィールは見えない');
select is(
  pg_temp.try_count($q$ select 1 from public.profiles where id = 'dddddddd-0000-0000-0000-000000000004' $q$),
  0, 'ログインなし：在籍が切れた出品者のプロフィールは見えない');
select throws_ok($$ select * from public.profiles_private $$, '42501', null,
  'ログインなし：個人情報は読めない');
select throws_ok($$ select * from public.reservations $$, '42501', null,
  'ログインなし：予約は読めない');
select throws_ok($$ select * from public.messages $$, '42501', null,
  'ログインなし：メッセージは読めない');
select throws_ok($$ select * from public.connect_accounts $$, '42501', null,
  'ログインなし：受取口座は読めない');
select throws_ok($$ select * from public.payment_customers $$, '42501', null,
  'ログインなし：カード保存先は読めない');
select throws_ok($$ select public.check_rate_limit('x', 1, 60) $$, '42501', null,
  'ログインなし：回数制限の関数は呼べない（他人の枠を消費させない）');
select throws_ok($$ select * from public.handover_reminders $$, '42501', null,
  'ログインなし：リマインドの送信記録は読めない');

-- =========================================================
-- ログイン済み：無関係な C
-- =========================================================
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');

select is(
  pg_temp.try_count($q$ select 1 from public.profiles where id in (
     'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002') $q$), 2,
  'ログイン済み：他人のプロフィール（名前・学部など）は見える');
select is(
  pg_temp.try_count($q$ select 1 from public.profiles_private where id <> 'cccccccc-0000-0000-0000-000000000003' $q$),
  0, 'ログイン済み：他人の個人情報（メール等）は見えない');
select is(
  pg_temp.try_count($q$ select 1 from public.profiles_private where id = 'cccccccc-0000-0000-0000-000000000003' $q$),
  1, 'ログイン済み：自分の個人情報は見える');
select is(
  pg_temp.try_count($q$ select 1 from public.reservations where id = '22222222-abab-0000-0000-000000000001' $q$),
  0, 'ログイン済み：他人どうしの予約は見えない');
select is(
  pg_temp.try_count($q$ select 1 from public.messages where reservation_id = '22222222-abab-0000-0000-000000000001' $q$),
  0, 'ログイン済み：他人どうしのメッセージは見えない');
select throws_ok($$ select * from public.connect_accounts $$, '42501', null,
  'ログイン済み：受取口座を全列で読むと失敗する（口座IDの列は渡さない）');
select throws_ok($$ select * from public.payment_customers $$, '42501', null,
  'ログイン済み：カード保存先を全列で読むと失敗する（決済会社のIDは渡さない）');
select throws_ok($$ select * from public.rate_limits $$, '42501', null,
  'ログイン済み：回数制限の表は読めない');
select throws_ok($$ select * from public.email_recovery_requests $$, '42501', null,
  'ログイン済み：復旧用トークンの表は読めない');
select throws_ok($$ select public.check_rate_limit('x', 1, 60) $$, '42501', null,
  'ログイン済み：回数制限の関数は呼べない');
select throws_ok($$ select * from public.handover_reminders $$, '42501', null,
  'ログイン済み：リマインドの送信記録は読めない（何通送ったかを当事者にも見せない）');

-- =========================================================
-- ログイン済み：取引の当事者
-- =========================================================
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select is(
  pg_temp.try_count($q$ select 1 from public.reservations where id = '22222222-abab-0000-0000-000000000001' $q$),
  1, '買い手：自分の予約は見える');
select is(
  pg_temp.try_count($q$ select 1 from public.messages where reservation_id = '22222222-abab-0000-0000-000000000001' $q$),
  1, '買い手：自分の取引のメッセージは見える');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is(
  pg_temp.try_count($q$ select 1 from public.reservations where id = '22222222-abab-0000-0000-000000000001' $q$),
  1, '出品者：自分の出品への予約は見える');
select is(
  (select transfers_enabled from public.connect_accounts where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  false, '出品者：自分の受取口座の状態（公開してよい列）は読める');

select * from finish();
rollback;
