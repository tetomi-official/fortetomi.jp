CREATE UNIQUE INDEX "profiles_private_university_email_uniq" ON "public"."profiles_private" USING "btree" ("lower"("university_email")) WHERE ("university_email" IS NOT NULL);
