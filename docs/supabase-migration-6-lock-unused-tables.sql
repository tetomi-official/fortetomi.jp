-- ===================================================
-- Migration 6: 未使用テーブル（books / users）をロック状態に統一
--   方針：テーブルは将来用に残すが、現状アプリ未参照・0行のため
--         クライアントロールの権限を完全に外す（RLS は有効・ポリシー無し＝全拒否のまま）。
--         残っていた authenticated への SELECT も剥奪し、GraphQL スキーマ露出を解消する。
--   将来 books を公開カタログとして使う際は、その時点で
--     create policy ... for select ... ;  grant select on public.books to anon, authenticated;
--   を追加する。
--   ※ enrollment_reverifications は service_role 専用（reverify API）で正しくロック済み。
--     クライアント権限・ポリシー不要のため変更しない。
--   何度流しても安全（idempotent）。
-- ===================================================

revoke all on public.books from anon, authenticated;
revoke all on public.users from anon, authenticated;
