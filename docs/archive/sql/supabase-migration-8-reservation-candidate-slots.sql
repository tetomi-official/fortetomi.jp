-- ===================================================
-- Migration 8: 購入希望の複数候補日時（案B / 機能④）
--   ※ migration 6/7 は別作業（lock-unused-tables / revoke-trigger-fn-execute）で使用済み。
--   買い手が受け渡し候補（日付＋時刻）を最大3件提示し、
--   出品者がその中から1つ選んで「承認済み」に確定できるようにする。
--   ステータス遷移（既存に追加されるのは出品者の「候補選択」のみ）：
--     申請中 --(出品者:候補を1つ選択)--> 承認済み   ※ selected_slot を書き込む
--   既存の別日程提案（proposed_* / 日程調整中）はそのまま温存する。
--   何度流しても安全（idempotent）。
-- ===================================================

-- 1) 候補日時（買い手が提示。array of {date,time} を JSONB で 1〜3 件）と、
--    出品者が選んだ候補の index（未選択時は null）。
--    candidate_slots は INSERT 時のみ書き込み、UPDATE 権限は付与しない（改ざん防止）。
alter table public.reservations add column if not exists candidate_slots jsonb;
alter table public.reservations add column if not exists selected_slot   smallint;

-- 2) 列レベル権限：既存（status, proposed_*）に selected_slot を追加して再付与。
revoke update on public.reservations from anon, authenticated;
grant  update (status, proposed_date, proposed_time, proposed_location, selected_slot)
  on public.reservations to authenticated;

-- 3) 更新時の整合性チェックを拡張：
--    proposed_*（代替日程）に加え、selected_slot（候補の確定）も出品者本人のみが書き換え可能。
--    買い手による日程詐称・勝手な確定を防ぐ。
create or replace function public.validate_reservation_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (new.proposed_date     is distinct from old.proposed_date
   or new.proposed_time     is distinct from old.proposed_time
   or new.proposed_location is distinct from old.proposed_location
   or new.selected_slot     is distinct from old.selected_slot)
   and auth.uid() <> old.seller_id then
    raise exception 'only the seller can propose a reschedule or select a candidate slot';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_reservation_before_update on public.reservations;
create trigger validate_reservation_before_update
  before update on public.reservations
  for each row execute function public.validate_reservation_update();
