#!/bin/bash
# 【一時的な道具・移行が終わったら消す】
# docs/ の旧SQLを、手順書の順番でローカルDBに流す。
# SQL Editor と同じく「1ファイル=1トランザクション」。最初の失敗で止める。
cd /Users/shimizuyasushikiyoshi/fortetomi.jp
FILES=(
  supabase-setup.sql
  STUB
  supabase-migration-2-profiles-private.sql
  supabase-migration-3-recovery-email.sql
  supabase-migration-3-reservation-reschedule.sql
  supabase-migration-4-recovery-email-verified.sql
  supabase-migration-4-listings-grants.sql
  supabase-migration-5-table-grants-hardening.sql
  supabase-migration-6-lock-unused-tables.sql
  supabase-migration-7-revoke-trigger-fn-execute.sql
  supabase-migration-8-reservation-candidate-slots.sql
  supabase-migration-9-messages.sql
  supabase-migration-9-payments.sql
  supabase-migration-10-syllabus.sql
  supabase-migration-11-listing-faculties.sql
  supabase-migration-12-rate-limits.sql
  supabase-migration-13-stripe.sql
  supabase-migration-14-connect-accounts-v2.sql
  supabase-migration-15-reservation-status-guard.sql
)
for f in "${FILES[@]}"; do
  src="docs/$f"; [ "$f" = STUB ] && src="scripts/db/stub-books-users.sql"
  out=$(docker exec -i supabase_db_fortetomi-jp psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 -q < "$src" 2>&1)
  rc=$?
  if [ $rc -ne 0 ]; then echo "NG  $f"; echo "$out" | grep -E 'ERROR|LINE|DETAIL|HINT' | head -8; exit 1; fi
  notices=$(echo "$out" | grep -c NOTICE)
  echo "OK  $f (NOTICE ${notices}件)"
done
