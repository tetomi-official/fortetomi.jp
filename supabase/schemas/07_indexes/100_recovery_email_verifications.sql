CREATE INDEX "recovery_email_verif_token_idx" ON "public"."recovery_email_verifications" USING "btree" ("token_hash");

CREATE INDEX "recovery_email_verif_user_idx" ON "public"."recovery_email_verifications" USING "btree" ("user_id", "created_at" DESC);
