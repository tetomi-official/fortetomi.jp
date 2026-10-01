CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_count int;
begin
  insert into public.rate_limits as rl (bucket, count, window_start)
  values (p_bucket, 1, now())
  on conflict (bucket) do update
    set
      -- ウィンドウを過ぎていれば 1 にリセット、以内なら +1。
      count = case
        when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
        else rl.count + 1
      end,
      window_start = case
        when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
        else rl.window_start
      end
  returning rl.count into v_count;

  -- 掃除（放置しない）: 呼び出しのたびに ~1% の確率で、古い期限切れ行をまとめて削除。
  -- bucket はユーザー/IP ごとに増えるため、これでテーブルの無限増殖を止める。
  -- ※ より確実にしたい場合は pg_cron で日次クリーンアップも張れる（任意・下記コメント参照）:
  --     select cron.schedule('rate_limits_cleanup', '0 4 * * *',
  --       $$delete from public.rate_limits where window_start < now() - interval '1 day'$$);
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_limit;
end;
$_$;

COMMENT ON FUNCTION "public"."check_rate_limit"("p_bucket" "text", "p_limit" integer, "p_window_seconds" integer) IS 'bucket を原子的にインクリメントし、ウィンドウ内カウントが上限以下なら true を返す。lib/rate-limit.ts から呼ぶ。';
