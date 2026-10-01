CREATE OR REPLACE TRIGGER "trg_reset_recovery_email_verified" BEFORE UPDATE ON "public"."profiles_private" FOR EACH ROW EXECUTE FUNCTION "public"."reset_recovery_email_verified"();
