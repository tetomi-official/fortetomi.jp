-- ===================================================
-- Migration 9: 取引メッセージ（PB-041）
--   買い手・出品者が「購入希望（reservation）」ごとにチャットでやり取りする。
--   1 予約 = 1 スレッド。メッセージは送信後に編集・削除できない（証跡として残す）。
--   RLS: その予約の buyer / seller 本人だけが閲覧・送信できる。
--   送信者の詐称を防ぐため sender_id = auth.uid() を with check で強制する。
--   何度流しても安全（idempotent）。
-- ===================================================

create table if not exists public.messages (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  sender_id      uuid not null references public.profiles(id) on delete cascade,
  body           text not null check (char_length(body) between 1 and 2000),
  created_at     timestamptz not null default now()
);

-- スレッド（予約）単位で時系列に引くためのインデックス。
create index if not exists messages_reservation_idx
  on public.messages (reservation_id, created_at);

alter table public.messages enable row level security;

-- 閲覧：その予約の当事者（買い手 or 出品者）本人のみ。
drop policy if exists "messages viewable by reservation participants" on public.messages;
create policy "messages viewable by reservation participants"
  on public.messages for select
  using (
    exists (
      select 1 from public.reservations r
      where r.id = messages.reservation_id
        and (auth.uid() = r.buyer_id or auth.uid() = r.seller_id)
    )
  );

-- 送信：送信者は本人（sender_id = auth.uid()）かつ、その予約の当事者であること。
drop policy if exists "participants can insert own messages" on public.messages;
create policy "participants can insert own messages"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.reservations r
      where r.id = messages.reservation_id
        and (auth.uid() = r.buyer_id or auth.uid() = r.seller_id)
    )
  );

-- テーブルレベル権限：anon は不要。authenticated は SELECT / INSERT のみ。
--   メッセージは証跡なので UPDATE / DELETE / TRUNCATE は付与しない（改ざん・消去の防止）。
revoke all on public.messages from anon, authenticated;
grant select, insert on public.messages to authenticated;

-- リアルタイム配信：相手の新着メッセージを即時に受け取れるよう publication に追加。
--   すでに追加済みのときは 42710 を無視する（idempotent）。
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null; -- publication が無い構成では何もしない
end $$;
