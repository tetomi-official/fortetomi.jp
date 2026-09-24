-- ポリシーは1つも置かない。RLS を有効にしたうえで誰にも権限を渡さないので、
-- service_role（RLS を越える）以外からは読むことも書くこともできない。
ALTER TABLE "public"."handover_reminders" ENABLE ROW LEVEL SECURITY;
