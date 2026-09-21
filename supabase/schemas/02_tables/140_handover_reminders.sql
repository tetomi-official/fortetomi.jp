CREATE TABLE IF NOT EXISTS "public"."handover_reminders" (
    "reservation_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "side" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "handover_reminders_kind_chk" CHECK (("kind" = ANY (ARRAY['2日前'::"text", '前日'::"text"]))),
    CONSTRAINT "handover_reminders_side_chk" CHECK (("side" = ANY (ARRAY['buyer'::"text", 'seller'::"text"])))
);

COMMENT ON TABLE "public"."handover_reminders" IS '受け渡しリマインドメールの送信済み記録。service_role 専用。主キーが二度送りを防ぐ（先に行を入れてから送り、送信に失敗したら行を消して次の回で拾い直す）。';

COMMENT ON COLUMN "public"."handover_reminders"."kind" IS 'どの回か。2日前=2日前の朝 / 前日=前日の夜。';

COMMENT ON COLUMN "public"."handover_reminders"."side" IS '送った相手。buyer=買い手 / seller=出品者。';

ALTER TABLE ONLY "public"."handover_reminders"
    ADD CONSTRAINT "handover_reminders_pkey" PRIMARY KEY ("reservation_id", "kind", "side");

ALTER TABLE ONLY "public"."handover_reminders"
    ADD CONSTRAINT "handover_reminders_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE CASCADE;
