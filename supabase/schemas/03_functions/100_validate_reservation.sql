CREATE OR REPLACE FUNCTION "public"."validate_reservation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
