-- 「書かせない」と「書ける」の境界。
-- 読み取り側（010）と同じく、塞ぎすぎて正しい操作が壊れていないかも確かめる。
begin;
\ir _helpers/helpers.psql
select plan(38);

-- ---- 準備：A が出品者、B が買い手、C は無関係、D は在籍切れ ----
select pg_temp.make_user('aaaaaaaa-0000-0000-0000-000000000001', 'test-a@g.chuo-u.ac.jp', '出品者A');
select pg_temp.make_user('bbbbbbbb-0000-0000-0000-000000000002', 'test-b@g.chuo-u.ac.jp', '買い手B');
select pg_temp.make_user('cccccccc-0000-0000-0000-000000000003', 'test-c@g.chuo-u.ac.jp', '無関係C');
select pg_temp.make_user('dddddddd-0000-0000-0000-000000000004', 'test-d@g.chuo-u.ac.jp', '卒業生D', false);
select pg_temp.make_listing('11111111-aaaa-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1000);
select pg_temp.make_listing('11111111-aaaa-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 2000);
select pg_temp.make_reservation('22222222-abab-0000-0000-000000000001',
  '11111111-aaaa-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');

-- =========================================================
-- 出品
-- =========================================================
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$
  insert into public.listings (title, subject, condition, price, location, seller_id)
  values ('自分の出品', 'テスト', '新品', 500, '正門前', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '在籍中の人は、自分の出品を作れる');
select throws_ok($$
  insert into public.listings (title, subject, condition, price, location, seller_id)
  values ('なりすまし', 'テスト', '新品', 500, '正門前', 'cccccccc-0000-0000-0000-000000000003') $$,
  '42501', null, '他人になりすまして出品できない');
select lives_ok($$ update public.listings set title = '書き直した' where id = '11111111-aaaa-0000-0000-000000000001' $$,
  '自分の出品は書き直せる');

select pg_temp.as_user('dddddddd-0000-0000-0000-000000000004');
select throws_ok($$
  insert into public.listings (title, subject, condition, price, location, seller_id)
  values ('卒業後の出品', 'テスト', '新品', 500, '正門前', 'dddddddd-0000-0000-0000-000000000004') $$,
  '42501', null, '在籍が切れた人は出品できない');

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select lives_ok($$ update public.listings set price = 1 where id = '11111111-aaaa-0000-0000-000000000002' $$,
  '（他人の出品を書き換えようとしても、エラーにはならず何も起きない）');
select lives_ok($$ delete from public.listings where id = '11111111-aaaa-0000-0000-000000000002' $$,
  '（他人の出品を消そうとしても、エラーにはならず何も起きない）');
select pg_temp.as_admin();
select is((select price from public.listings where id = '11111111-aaaa-0000-0000-000000000002'), 2000,
  '他人の出品は書き換えられない（値段がそのまま）');
select is(pg_temp.try_count($q$ select 1 from public.listings where id = '11111111-aaaa-0000-0000-000000000002' $q$), 1,
  '他人の出品は消せない');

-- =========================================================
-- プロフィール
-- =========================================================
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select lives_ok($$ update public.profiles set name = '新しい名前' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '自分の名前は変えられる');
select throws_ok($$ update public.profiles set rating = 5 where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, '自分の評価は書き換えられない');
select throws_ok($$ update public.profiles set enrollment_valid_until = now() + interval '10 years'
                    where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, '自分の在籍期限は延ばせない');
select throws_ok($$ update public.profiles_private set recovery_email_verified = true
                    where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null, '復旧用メールを「確認済み」に自分で変えられない');
select lives_ok($$ update public.profiles set name = '乗っ取り' where id = 'bbbbbbbb-0000-0000-0000-000000000002' $$,
  '（他人の名前を変えようとしても、エラーにはならず何も起きない）');
select pg_temp.as_admin();
select is((select name from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002'), '買い手B',
  '他人の名前は変えられない');

-- =========================================================
-- 予約をつくる
-- =========================================================
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select lives_ok($$
  insert into public.reservations (listing_id, buyer_id, seller_id, price, preferred_date, preferred_time, preferred_location)
  values ('11111111-aaaa-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
          'aaaaaaaa-0000-0000-0000-000000000001', 2000, '2026-10-01', '昼休み', '正門前') $$,
  '在籍中の人は、購入希望を出せる');
select throws_ok($$
  insert into public.reservations (listing_id, buyer_id, seller_id, price, preferred_date, preferred_time, preferred_location)
  values ('11111111-aaaa-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003',
          'aaaaaaaa-0000-0000-0000-000000000001', 2000, '2026-10-01', '昼休み', '正門前') $$,
  '42501', null, '他人になりすまして購入希望を出せない');
select throws_ok($$
  insert into public.reservations (listing_id, buyer_id, seller_id, price, preferred_date, preferred_time, preferred_location)
  values ('11111111-aaaa-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
          'aaaaaaaa-0000-0000-0000-000000000001', 1, '2026-10-01', '昼休み', '正門前') $$,
  'P0001', null, '出品と違う値段で購入希望を出せない');

select pg_temp.as_user('dddddddd-0000-0000-0000-000000000004');
select throws_ok($$
  insert into public.reservations (listing_id, buyer_id, seller_id, price, preferred_date, preferred_time, preferred_location)
  values ('11111111-aaaa-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000004',
          'aaaaaaaa-0000-0000-0000-000000000001', 2000, '2026-10-01', '昼休み', '正門前') $$,
  '42501', null, '在籍が切れた人は購入希望を出せない');

-- =========================================================
-- 予約の状態を動かす（申請中 → 承認済み は出品者だけ）
-- =========================================================
select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select lives_ok($$ update public.reservations set status = 'キャンセル' where id = '22222222-abab-0000-0000-000000000001' $$,
  '（無関係な人が予約を取り消そうとしても、エラーにはならず何も起きない）');
select pg_temp.as_admin();
select is((select status from public.reservations where id = '22222222-abab-0000-0000-000000000001'), '申請中',
  '無関係な人は予約の状態を変えられない');

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select throws_ok($$ update public.reservations set status = '承認済み' where id = '22222222-abab-0000-0000-000000000001' $$,
  'P0001', null, '買い手は自分の申請を承認できない');
select throws_ok($$ update public.reservations set proposed_date = '2026-12-31' where id = '22222222-abab-0000-0000-000000000001' $$,
  'P0001', null, '買い手は日程の逆提案を書けない（出品者だけ）');
select throws_ok($$ update public.reservations set price = 1 where id = '22222222-abab-0000-0000-000000000001' $$,
  '42501', null, '予約の値段は書き換えられない');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$ update public.reservations set status = '完了' where id = '22222222-abab-0000-0000-000000000001' $$,
  'P0001', null, '申請中からいきなり完了にはできない（決済を経ずに取引を終えさせない）');
select lives_ok($$ update public.reservations set status = '承認済み' where id = '22222222-abab-0000-0000-000000000001' $$,
  '出品者は申請を承認できる');
select pg_temp.as_admin();
select is((select status from public.listings where id = '11111111-aaaa-0000-0000-000000000001'), '予約済み',
  '承認すると、出品が「予約済み」に変わる');

-- =========================================================
-- メッセージ
-- =========================================================
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select lives_ok($$ insert into public.messages (reservation_id, sender_id, body)
                   values ('22222222-abab-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'こんにちは') $$,
  '当事者はメッセージを送れる');
select throws_ok($$ insert into public.messages (reservation_id, sender_id, body)
                    values ('22222222-abab-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '偽物') $$,
  '42501', null, '相手になりすましてメッセージを送れない');
select throws_ok($$ update public.messages set body = '書き換え' where reservation_id = '22222222-abab-0000-0000-000000000001' $$,
  '42501', null, '送ったメッセージは書き換えられない（やりとりの記録を残す）');
select throws_ok($$ delete from public.messages where reservation_id = '22222222-abab-0000-0000-000000000001' $$,
  '42501', null, '送ったメッセージは消せない');

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select throws_ok($$ insert into public.messages (reservation_id, sender_id, body)
                    values ('22222222-abab-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', '割り込み') $$,
  '42501', null, '無関係な人は他人の取引にメッセージを送れない');

-- =========================================================
-- 決済まわり（書き込みはサーバーだけ）
-- =========================================================
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok($$ insert into public.connect_accounts (user_id, stripe_account_id)
                    values ('aaaaaaaa-0000-0000-0000-000000000001', 'acct_fake') $$,
  '42501', null, '受取口座を自分で登録できない（サーバーだけが書く）');
select throws_ok($$ insert into public.payment_customers (user_id, provider, stripe_customer_id)
                    values ('aaaaaaaa-0000-0000-0000-000000000001', 'stripe', 'cus_fake') $$,
  '42501', null, 'カードの保存先を自分で登録できない（他人のカードで払わせない）');

-- =========================================================
-- 画像の置き場（listing-images）
-- =========================================================
select lives_ok($$ insert into storage.objects (bucket_id, name, owner)
                   values ('listing-images', 'aaaaaaaa-0000-0000-0000-000000000001/photo.png', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '自分のフォルダには画像を置ける');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner)
                    values ('listing-images', 'bbbbbbbb-0000-0000-0000-000000000002/photo.png', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, '他人のフォルダには画像を置けない');

-- =========================================================
-- 新規登録（auth.users のトリガー。public の外なので自動の差分チェックでは見張れない）
-- =========================================================
select pg_temp.as_admin();
select throws_ok($$ select pg_temp.make_user('eeeeeeee-0000-0000-0000-000000000005', 'someone@gmail.com', '部外者') $$,
  'P0001', null, '大学のメール以外では登録できない');
select pg_temp.make_user('eeeeeeee-0000-0000-0000-000000000006', 'newbie@g.chuo-u.ac.jp', '新入生');
select is(pg_temp.try_count($q$ select 1 from public.profiles where id = 'eeeeeeee-0000-0000-0000-000000000006' $q$), 1,
  '登録すると、プロフィールが自動でできる');
select is((select university_email from public.profiles_private where id = 'eeeeeeee-0000-0000-0000-000000000006'),
  'newbie@g.chuo-u.ac.jp', '登録すると、大学メールが個人情報の表に入る');

select * from finish();
rollback;
