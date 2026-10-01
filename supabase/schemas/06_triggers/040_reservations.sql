CREATE OR REPLACE TRIGGER "sync_listing_status_after_update" AFTER UPDATE OF "status" ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."sync_listing_status"();

CREATE OR REPLACE TRIGGER "validate_reservation_before_insert" BEFORE INSERT ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."validate_reservation"();

CREATE OR REPLACE TRIGGER "validate_reservation_before_update" BEFORE UPDATE ON "public"."reservations" FOR EACH ROW EXECUTE FUNCTION "public"."validate_reservation_update"();
