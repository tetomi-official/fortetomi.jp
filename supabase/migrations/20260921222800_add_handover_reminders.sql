CREATE TABLE "public"."handover_reminders" (
  "reservation_id" uuid                     NOT NULL,
  "kind"           text                     NOT NULL,
  "side"           text                     NOT NULL,
  "sent_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "handover_reminders_kind_chk" CHECK ((kind = ANY (ARRAY['2日前'::text, '前日'::text]))),
  CONSTRAINT "handover_reminders_pkey" PRIMARY KEY (reservation_id, kind, side),
  CONSTRAINT "handover_reminders_side_chk" CHECK ((side = ANY (ARRAY['buyer'::text, 'seller'::text])))
);

ALTER TABLE "public"."handover_reminders"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."handover_reminders"
  ADD CONSTRAINT "handover_reminders_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE CASCADE;

CREATE INDEX reservations_approved_idx ON public.reservations USING btree (status)
  WHERE (status = '承認済み'::text);

COMMENT ON COLUMN "public"."handover_reminders"."kind" IS 'どの回か。2日前=2日前の朝 / 前日=前日の夜。';

COMMENT ON COLUMN "public"."handover_reminders"."side" IS '送った相手。buyer=買い手 / seller=出品者。';

COMMENT ON TABLE "public"."handover_reminders" IS '受け渡しリマインドメールの送信済み記録。service_role 専用。主キーが二度送りを防ぐ（先に行を入れてから送り、送信に失敗したら行を消して次の回で拾い直す）。';

-- public にテーブルを作ると Supabase が anon・authenticated に自動で全権限を付ける。
-- 自動生成の差分はこれをはがす文を出さないので手で足す（docs/operations/db-workflow.md 3章 (a)）。
-- はがす文を先、付ける文を後に置く（同 (b)）。
REVOKE ALL ON TABLE "public"."handover_reminders" FROM "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."handover_reminders" TO "postgres", "service_role";
