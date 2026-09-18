-- ===================================================
-- Migration 3: 予約の日程逆提案（リスケ）対応（PB-034 / 機能③）
--   出品者が買い手の希望日とは別の日程を提案でき、買い手がそれを承諾できるようにする。
--   ステータス遷移：
--     申請中     --(出品者:承認)-->     承認済み
--     申請中     --(出品者:断る)-->     キャンセル
--     申請中     --(出品者:別日程提案)--> 日程調整中   ※ proposed_* を書き込む
--     日程調整中 --(買い手:承諾)-->     承認済み
--     日程調整中 --(買い手:断る)-->     キャンセル
--     承認済み   --(出品者:完了)-->     完了
--   何度流しても安全（idempotent）。
-- ===================================================

-- 1) 出品者が提案する代替日程の列（いずれも任意。提案前は null）。
alter table public.reservations add column if not exists proposed_date     text;
alter table public.reservations add column if not exists proposed_time     text;
alter table public.reservations add column if not exists proposed_location text;

-- 2) 列レベル権限：status に加え proposed_* も authenticated が更新可能にする。
--    （買い手が proposed_* を書き換える不正は 3) のトリガーで防ぐ。）
revoke update on public.reservations from anon, authenticated;
grant  update (status, proposed_date, proposed_time, proposed_location)
  on public.reservations to authenticated;

-- 3) 更新時の整合性チェック：proposed_*（代替日程）は出品者本人のみが書き換え可能。
--    買い手による日程詐称（自分に都合のよい日程を勝手に提案扱いにする）を防ぐ。
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
