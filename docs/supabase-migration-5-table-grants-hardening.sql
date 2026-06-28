-- ===================================================
-- Migration 5: テーブルレベル権限の全体是正（anon 過剰権限の剥奪）
--   背景：Supabase 既定の GRANT ALL が残り、anon が私用テーブルに
--         INSERT/DELETE/TRUNCATE 等を持っていた（DML は RLS で防御されるが
--         TRUNCATE は RLS 対象外）。listings(Migration 4) と同方針で全テーブルを是正。
--   原則：
--     - anon            … 公開閲覧が要るテーブル以外は権限ゼロ
--     - authenticated   … ポリシーがある操作（SELECT/INSERT/UPDATE）のみ。
--                          TRUNCATE/REFERENCES/TRIGGER と、ポリシーの無い DELETE は剥奪。
--   注記：
--     - profiles / profiles_private は handle_new_user(SECURITY DEFINER) が自動生成するため、
--       クライアント(anon)の INSERT は不要。
--     - reservations の authenticated UPDATE は列レベル(status, proposed_*)を維持（剥奪しない）。
--     - books / users はアプリ未参照。書き込み系を剥奪（SELECT/RLS は Migration 6 で判断）。
--   何度流しても安全（idempotent）。
-- ===================================================

-- profiles：anon 不要。authenticated は SELECT/INSERT/UPDATE のみ。
revoke all on public.profiles from anon;
revoke truncate, references, trigger, delete on public.profiles from authenticated;

-- profiles_private：anon 不要。authenticated は SELECT/INSERT/UPDATE のみ。
revoke all on public.profiles_private from anon;
revoke truncate, references, trigger, delete on public.profiles_private from authenticated;

-- reservations：anon 不要。authenticated は SELECT/INSERT + 列レベルUPDATE(既存)。
revoke all on public.reservations from anon;
revoke truncate, references, trigger, delete on public.reservations from authenticated;

-- books：アプリ未参照。anon は全剥奪、authenticated は書き込み系のみ剥奪（SELECT は据え置き）。
revoke all on public.books from anon;
revoke insert, update, delete, truncate, references, trigger on public.books from authenticated;

-- users：アプリ未参照（profiles と重複）。anon は全剥奪、authenticated は書き込み系を剥奪。
revoke all on public.users from anon;
revoke insert, update, delete, truncate, references, trigger on public.users from authenticated;
