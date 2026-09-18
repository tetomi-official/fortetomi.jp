CREATE OR REPLACE FUNCTION "public"."validate_reservation_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
