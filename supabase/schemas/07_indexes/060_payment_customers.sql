CREATE UNIQUE INDEX "payment_customers_stripe_customer_uniq" ON "public"."payment_customers" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);
