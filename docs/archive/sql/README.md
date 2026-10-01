# 昔の SQL（もう使わない）

ここにあるのは、Supabase の SQL Editor に手で貼って本番を変えていたころの SQL。
**歴史的な記録として残しているだけで、もう流さない。**

今の正しい姿は次の2つ。手順は [`docs/operations/db-workflow.md`](../../operations/db-workflow.md)。

- `supabase/schemas/`（本番の今の姿）
- `supabase/migrations/`（本番に当てた変更の記録）

## 当時の適用順

番号が重なっているもの（3・4・9）があるので注意。

setup → 2 → 3（recovery-email）→ 3（reservation-reschedule）→ 4（recovery-email-verified）→ 4（listings-grants）→ 5 → 6 → 7 → 8 → 9（messages）→ 9（payments）→ 10 → 11 → 12 → 13 → 14 → 15

## 読むときの注意

- **migration-2 と migration-4 は anon の扱いが食い違っている。**
  migration-2 は「ログインしないと出品一覧は見られない」前提で、listings の SELECT と `is_enrollment_active` を anon から外している。
  migration-4 はその逆で、ログインなしでも出品一覧を見せるために listings の SELECT を anon に付け直した。ただし `is_enrollment_active` は戻していない。
  2026-09-18 にこの関数を anon から外したら、ログインなしの出品一覧が空になり、同じ日に戻した
  （`supabase/migrations/20260918063915_restore_anon_is_enrollment_active.sql`）。
- ファイルの中に書いてある「SQL Editor に貼って Run」などの手順は、今は当てはまらない。
