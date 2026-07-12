-- ===================================================
-- Migration 7: トリガー専用関数の RPC 公開を遮断
--   背景：SECURITY DEFINER のトリガー関数が PUBLIC への既定 EXECUTE により
--         PostgREST の /rest/v1/rpc/<fn> として誰でも呼べる状態だった。
--   対応：トリガー経由でのみ使う 4 関数の EXECUTE を public/anon/authenticated から剥奪。
--         トリガーの発火は呼び出しロールの EXECUTE 権限に依存しないため動作に影響なし。
--   維持：count_active_listings / get_newest_listings / is_university_email_taken /
--         is_enrollment_active は正規 RPC・RLS で使用するため公開のまま。
--   何度流しても安全（idempotent）。
-- ===================================================

revoke execute on function public.handle_new_user()            from public, anon, authenticated;
revoke execute on function public.enforce_email_domain()       from public, anon, authenticated;
revoke execute on function public.validate_reservation()       from public, anon, authenticated;
revoke execute on function public.validate_reservation_update() from public, anon, authenticated;
