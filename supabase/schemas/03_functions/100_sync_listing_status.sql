CREATE OR REPLACE FUNCTION "public"."sync_listing_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

COMMENT ON FUNCTION "public"."sync_listing_status"() IS '予約が承認済みになったら出品を予約済みに、外れたら出品中に戻す。完了は reconcile.ts の担当。';
