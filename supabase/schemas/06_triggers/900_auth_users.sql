-- auth.users にかかるトリガー2本。
--
-- ここだけ本番ダンプから取れないので手で書いている。ダンプの既定は public スキーマだけで、
-- auth は Supabase 側の引き出しのため含まれない。
-- 内容は docs/supabase-setup.sql と docs/supabase-migration-3-recovery-email.sql のものと同じ。
--
-- 注意：この2本は supabase db diff の差分にも出てこない（public の外のため）。
--       壊れていないことは pgTAP のテストで見張る。

drop trigger if exists "enforce_email_domain_before_insert" on "auth"."users";
create trigger "enforce_email_domain_before_insert"
  before insert on "auth"."users"
  for each row execute function "public"."enforce_email_domain"();

drop trigger if exists "on_auth_user_created" on "auth"."users";
create trigger "on_auth_user_created"
  after insert on "auth"."users"
  for each row execute function "public"."handle_new_user"();
