-- messages をリアルタイム配信に載せる（相手の新着メッセージを即時に受け取るため）。
-- 二重に足すとエラーになるので、既に入っていれば何もしない形にする。
do $$
begin
  alter publication "supabase_realtime" add table only "public"."messages";
exception
  when duplicate_object then null;   -- 既に載っている
  when undefined_object then null;   -- publication が無い構成
end $$;
