-- ===================================================
-- Migration 4: listings のテーブルレベル権限を是正
--   問題：anon に SELECT が無く（公開閲覧が permission denied で壊れる）、
--         一方で INSERT/UPDATE/DELETE/TRUNCATE 等の書き込み系が付与されていた。
--         （DML は RLS で弾かれるが、TRUNCATE は RLS の対象外＝テーブル権限のみが防御線。）
--   方針：
--     - anon          … 公開閲覧のみ（SELECT を付与し、書き込み系を剥奪）
--     - authenticated … API に必要な SELECT/INSERT/UPDATE/DELETE は維持（行制御は RLS）。
--                        不要かつ危険な TRUNCATE/REFERENCES/TRIGGER は剥奪。
--   ※ RLS ポリシー自体は健全なため変更しない。
--   何度流しても安全（idempotent）。
-- ===================================================

-- anon：閲覧のみ。
grant  select on public.listings to anon;
revoke insert, update, delete, truncate, references, trigger
  on public.listings from anon;

-- authenticated：不要な強権を剥奪（DML/SELECT は残す）。
revoke truncate, references, trigger
  on public.listings from authenticated;
