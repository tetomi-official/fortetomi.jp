CREATE INDEX "email_recovery_token_idx" ON "public"."email_recovery_requests" USING "btree" ("token_hash");

CREATE INDEX "email_recovery_user_idx" ON "public"."email_recovery_requests" USING "btree" ("user_id", "created_at" DESC);
