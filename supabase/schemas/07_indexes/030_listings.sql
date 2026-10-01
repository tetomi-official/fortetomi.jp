CREATE INDEX "listings_faculties_gin" ON "public"."listings" USING "gin" ("faculties");

CREATE INDEX "listings_seller_id_idx" ON "public"."listings" USING "btree" ("seller_id");

CREATE INDEX "listings_status_created_idx" ON "public"."listings" USING "btree" ("status", "created_at" DESC);
