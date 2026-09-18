CREATE INDEX "enrollment_reverif_token_idx" ON "public"."enrollment_reverifications" USING "btree" ("token_hash");

CREATE INDEX "enrollment_reverif_user_idx" ON "public"."enrollment_reverifications" USING "btree" ("user_id", "created_at" DESC);
