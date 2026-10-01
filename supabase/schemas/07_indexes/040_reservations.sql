CREATE INDEX "reservations_buyer_idx" ON "public"."reservations" USING "btree" ("buyer_id", "created_at" DESC);

CREATE INDEX "reservations_charge_id_idx" ON "public"."reservations" USING "btree" ("charge_id");

CREATE INDEX "reservations_listing_idx" ON "public"."reservations" USING "btree" ("listing_id");

CREATE UNIQUE INDEX "reservations_payment_intent_uniq" ON "public"."reservations" USING "btree" ("payment_intent_id") WHERE ("payment_intent_id" IS NOT NULL);

CREATE INDEX "reservations_seller_idx" ON "public"."reservations" USING "btree" ("seller_id", "created_at" DESC);
