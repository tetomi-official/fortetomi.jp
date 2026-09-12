-- ===================================================================
-- Migration 15: 予約ステータスの歯止めと、出品の「予約済み」追随 — A-3 / A-4 / A-5
--
-- 目的:
--   1) 予約ステータスを、決められた順番でしか動かせないようにする。
--      これまで status 列には CHECK 制約も遷移チェックも無く、列更新の権限が
--      当事者に開いていたため、**買い手が支払わずに「完了」と書き込めた**。
--   2) 取引が承認済みになったら、その出品を「予約済み」にして一覧から外す。
--      これまで ListingStatus に「予約済み」という値はあるのにどこからも
--      書かれておらず、承認済みの本が一覧に残って二重売りになっていた。
--   3) 受け渡し前の取りやめ（承認済み → キャンセル）を正式に認め、
--      取りやめたら出品を「出品中」に戻す。
--
-- 設計上の判断（あとで読む人向け）:
--  1) 遷移表は lib/reservation-flow.ts にも同じものがある。画面はそちらを見て
--     ボタンを出し分け、DB はここで強制する。**片方だけ直すと食い違う。**
--
--  2) service_role（auth.uid() が null）は遷移チェックを飛ばす。
--     決済成立時の markReservationPaid（承認済み→完了）と、返金スクリプトの
--     完了→キャンセル を通すため。既存の validate_reservation_update() が
--     auth.uid() <> old.seller_id で service_role を素通しにしているのと同じ考え方。
--
--  3) 「完了」は人からは書けない。決済が成立したサーバー処理だけが書ける。
--     これが A-4（支払わずに完了）を塞ぐ肝。
--
--  4) 出品の「完了」はこのトリガーでは触らない。決済成立時の
--     listings.status = '完了' は lib/payment-provider/reconcile.ts が
--     唯一の書き込み口、という設計を崩さないため。ここが触るのは
--     出品中 ⇄ 予約済み の往復だけ。
--     そのため返金（完了→キャンセル）でも出品は「完了」のまま残る＝今の挙動を変えない。
--
--  5) sync_listing_status() は security definer。買い手がキャンセルしたときに
--     出品を「出品中」へ戻す必要があるが、listings の RLS は「自分の出品しか
--     更新できない」ため、買い手のセッションのままでは0行更新になる。
--     関数の所有者(postgres)権限で RLS を越える。count_active_listings と同じ仕組み。
--
--  6) キャンセルに落ちるとき payment_nonce_hash を消す。BEFORE トリガー内の
--     代入なので列レベル権限に関係なく書ける。消さないと、一度承認済みに戻せば
--     古いQRがまた通ってしまう。
--
-- 適用順序: supabase-setup.sql(#1) → migration-2 → … → migration-14 → この #15。
-- ※ Supabase SQL Editor は全体を1トランザクションで実行するため、途中エラーで全ロールバック。
-- ※ 何度流しても同じ結果になる（idempotent）。
-- ===================================================================

-- ----------------------------------------------------------------------------
-- 1) ステータスの値そのものを縛る ---------------------------------------------
--    これまで TypeScript の型でしか決まっておらず、DBはどんな文字列でも受けていた。
-- ----------------------------------------------------------------------------
alter table public.reservations drop constraint if exists reservations_status_chk;
alter table public.reservations add  constraint reservations_status_chk
  check (status in ('申請中','日程調整中','承認済み','完了','キャンセル'));

alter table public.listings drop constraint if exists listings_status_chk;
alter table public.listings add  constraint listings_status_chk
  check (status in ('出品中','予約済み','完了'));

-- ----------------------------------------------------------------------------
-- 2) 遷移の強制 ---------------------------------------------------------------
--    既存の validate_reservation_update()（migration 3 → 8 で育ててきたもの）を
--    置き換えて拡張する。トリガーは validate_reservation_before_update の1本のまま。
--
--    許す遷移（lib/reservation-flow.ts と同じ表）:
--      申請中     --(出品者)--> 承認済み       候補の確定／そのまま承認
--      申請中     --(出品者)--> 日程調整中     別日程の逆提案
--      申請中     --(双方)----> キャンセル     取り下げ／断る
--      日程調整中 --(買い手)--> 承認済み       逆提案の承諾
--      日程調整中 --(双方)----> キャンセル
--      承認済み   --(双方)----> キャンセル     受け渡し前の取りやめ
--      承認済み   --(サーバー)-> 完了          QRが読み取られ決済が成立した
-- ----------------------------------------------------------------------------
create or replace function public.validate_reservation_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  actor text;
begin
  -- 日程まわりの列は出品者しか書けない（migration 8 から引き継ぎ）。
  if (new.proposed_date     is distinct from old.proposed_date
   or new.proposed_time     is distinct from old.proposed_time
   or new.proposed_location is distinct from old.proposed_location
   or new.selected_slot     is distinct from old.selected_slot)
   and auth.uid() <> old.seller_id then
    raise exception 'only the seller can propose a reschedule or select a candidate slot';
  end if;

  -- ここから下はステータスが動くときだけ。決済列だけを書き換える更新は素通しする。
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- キャンセルになったら、発行済みのQRの合言葉を無効にする。
  if new.status = 'キャンセル' then
    new.payment_nonce_hash := null;
  end if;

  -- service_role（サーバー処理）は遷移チェックの対象外。
  -- 決済成立の記録と返金の巻き戻しはここを通る。
  if auth.uid() is null then
    return new;
  end if;

  if auth.uid() = old.seller_id then
    actor := 'seller';
  elsif auth.uid() = old.buyer_id then
    actor := 'buyer';
  else
    -- RLS で当事者以外はそもそも更新できないが、念のため。
    raise exception 'only the buyer or the seller can change a reservation status';
  end if;

  if not (
       (old.status = '申請中'     and new.status = '承認済み'   and actor = 'seller')
    or (old.status = '申請中'     and new.status = '日程調整中' and actor = 'seller')
    or (old.status = '申請中'     and new.status = 'キャンセル')
    or (old.status = '日程調整中' and new.status = '承認済み'   and actor = 'buyer')
    or (old.status = '日程調整中' and new.status = 'キャンセル')
    or (old.status = '承認済み'   and new.status = 'キャンセル')
  ) then
    raise exception 'invalid reservation status transition: % -> % (actor=%)',
      old.status, new.status, actor;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_reservation_before_update on public.reservations;
create trigger validate_reservation_before_update
  before update on public.reservations
  for each row execute function public.validate_reservation_update();

-- ----------------------------------------------------------------------------
-- 3) 出品ステータスの追随 ------------------------------------------------------
--    承認済みになったら「予約済み」、承認済みから外れたら「出品中」に戻す。
--    「完了」は触らない（4 の判断）。
-- ----------------------------------------------------------------------------
create or replace function public.sync_listing_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- 承認済みになった → 出品を押さえる（まだ出品中のときだけ）。
  if new.status = '承認済み' and old.status is distinct from '承認済み' then
    update public.listings
       set status = '予約済み'
     where id = new.listing_id
       and status = '出品中';

  -- 取りやめた → 他に承認済みが残っていなければ出品中に戻す。
  -- ★ここを「承認済みから外れたら」と書いてはいけない。決済成立（承認済み→完了）でも
  --   発火してしまい、売れた本を一瞬「出品中」に戻してしまう（reconcile.ts が直後に
  --   「完了」を書くので最終的には直るが、そこが失敗すると売り切れた本が再び並ぶ）。
  elsif old.status = '承認済み' and new.status = 'キャンセル' then
    if not exists (
      select 1 from public.reservations r
       where r.listing_id = new.listing_id
         and r.id        <> new.id
         and r.status     = '承認済み'
    ) then
      update public.listings
         set status = '出品中'
       where id = new.listing_id
         and status = '予約済み';
    end if;
  end if;

  return null; -- AFTER トリガーなので戻り値は使われない
end;
$$;

drop trigger if exists sync_listing_status_after_update on public.reservations;
create trigger sync_listing_status_after_update
  after update of status on public.reservations
  for each row execute function public.sync_listing_status();

-- ----------------------------------------------------------------------------
-- 4) トリガー専用関数の RPC 公開を遮断（migration 7 と同じ決まりごと）------------
--    関数は既定で PUBLIC に EXECUTE が付き、PostgREST の /rest/v1/rpc/<fn> として
--    誰でも呼べてしまう。public を必ず revoke 対象に含めること。
-- ----------------------------------------------------------------------------
revoke execute on function public.sync_listing_status()       from public, anon, authenticated;
revoke execute on function public.validate_reservation_update() from public, anon, authenticated;

comment on function public.sync_listing_status() is
  '予約が承認済みになったら出品を予約済みに、外れたら出品中に戻す。完了は reconcile.ts の担当。';

-- ----------------------------------------------------------------------------
-- 5) すでにある承認済みの取引を取り込む ------------------------------------------
--    トリガーは「これから起きる変更」にしか効かないので、適用時点で承認済みなのに
--    出品が押さえられていないものを一度だけ揃える。
-- ----------------------------------------------------------------------------
update public.listings l
   set status = '予約済み'
 where l.status = '出品中'
   and exists (
     select 1 from public.reservations r
      where r.listing_id = l.id
        and r.status     = '承認済み'
   );

-- ※ 逆向き（予約済みなのに承認済みの取引が無い出品）は自動では直さない。
--    シードデータに「予約済み」の本が含まれており、勝手に一覧へ出すと
--    デモの見え方が変わってしまうため。運用で戻したくなったら次を手で流す:
--
--    update public.listings l set status = '出品中'
--     where l.status = '予約済み'
--       and not exists (select 1 from public.reservations r
--                        where r.listing_id = l.id and r.status in ('承認済み','完了'));
