CREATE INDEX "messages_reservation_idx" ON "public"."messages" USING "btree" ("reservation_id", "created_at");
