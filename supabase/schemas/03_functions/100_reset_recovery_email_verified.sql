CREATE OR REPLACE FUNCTION "public"."reset_recovery_email_verified"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.recovery_email is distinct from old.recovery_email then
    new.recovery_email_verified := false;
    new.recovery_email_verified_at := null;
  end if;
  return new;
end;
$$;
