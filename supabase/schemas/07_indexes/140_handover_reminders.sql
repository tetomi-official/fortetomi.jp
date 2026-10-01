-- リマインドの対象を探すとき、承認済み（＝日程が決まって未完了）の予約だけを見る。
-- 完了・キャンセルが積み上がっても走査の量が増えないように、部分索引にする。
CREATE INDEX "reservations_approved_idx" ON "public"."reservations" USING "btree" ("status") WHERE ("status" = '承認済み'::"text");
