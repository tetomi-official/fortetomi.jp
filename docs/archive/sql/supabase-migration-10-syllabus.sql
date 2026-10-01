-- ===================================================================
-- Migration 10: シラバス情報（PB-056）— 中央大学シラバスDBのスクレイピング保存先
--
-- 目的: 「どの授業がどの教科書(ISBN)を使うか」のマスタを作り、将来の
--       PB-058（ISBN→書籍→授業名 自動ラベリング）の結合キーにする。
--   - syllabus_courses   … 1科目1行（シラバスサイトの数値ID を主キーに upsert 冪等化）
--   - syllabus_textbooks … 科目×ISBN の正規化表（ISBN 逆引きインデックス付き＝058の高速照合用）
--
-- どちらも参照系マスタ。RLS を有効化し、authenticated には SELECT のみ許可、
-- 書き込みは service_role（scripts/scrape-syllabus.mjs）だけが行う。既存流儀に合わせる。
--
-- 適用順序: supabase-setup.sql(#1) → migration-2 → ... → この #10。
-- ※ Supabase SQL Editor は全体を1トランザクションで実行するため、途中エラーで全ロールバック。
-- ===================================================================

-- 1) 科目本体 ---------------------------------------------------------------------
create table if not exists public.syllabus_courses (
  id              bigint primary key,          -- シラバスサイトの detail?id=N（自然キー）
  year            int,                          -- 年度（例: 2026）
  faculty         text,                         -- 学部・研究科など
  campus          text,                         -- faculty から導出（多摩 / 茗荷谷 / 後楽園 / 市ヶ谷田町 …）
  course_name     text,                         -- 授業科目名
  course_code     text,                         -- 科目ナンバー
  instructor      text,                         -- 担当教員（姓 名。複数の場合は連結される）
  instructor_kana text,                         -- 教員カナ氏名
  term            text,                         -- 学期（春学期 / 秋学期 / 通年 …）
  day_period      text,                         -- 開講曜日・時限（例: 火4）
  year_level      text,                         -- 配当年次（例: 3･4年次配当）
  credits         int,                          -- 単位数
  language        text,                         -- 授業で使用する言語
  summary         text,                         -- 授業の概要
  objectives      text,                         -- 科目目的
  schedule        text,                         -- 授業計画と内容
  grading         text,                         -- 成績評価の方法・基準
  references_raw  text,                         -- テキスト・参考文献等（原文まるごと。ISBN抽出元）
  other_notes     text,                         -- その他特記事項
  ref_url         text,                         -- 参考URL
  textbooks       jsonb not null default '[]'::jsonb, -- [{isbn13, isbn_raw}] 抽出済みISBN
  raw_items       jsonb,                         -- 詳細ページの全ラベル→値（再処理用・全情報保持）
  source_url      text,
  scraped_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists syllabus_courses_faculty_idx on public.syllabus_courses (faculty);
create index if not exists syllabus_courses_campus_idx  on public.syllabus_courses (campus);

comment on table public.syllabus_courses is '中央大学シラバスDBのスクレイピング結果（1科目1行）。書き込みは service_role のみ。PB-056。';
comment on column public.syllabus_courses.id is 'シラバスサイト /syllabus/detail/?id=N の数値ID（upsert の自然キー）';
comment on column public.syllabus_courses.textbooks is 'references_raw から抽出した ISBN 群 [{isbn13, isbn_raw}]';

-- 2) 科目×ISBN 正規化表（058 の ISBN 逆引き用） ------------------------------------
create table if not exists public.syllabus_textbooks (
  id         bigserial primary key,
  course_id  bigint not null references public.syllabus_courses(id) on delete cascade,
  isbn13     text   not null,                    -- 13桁に正規化（ISBN-10 は変換済み）
  isbn_raw   text,                               -- 原文に出てきた表記
  created_at timestamptz not null default now()
);

create index if not exists syllabus_textbooks_isbn13_idx on public.syllabus_textbooks (isbn13);
create index if not exists syllabus_textbooks_course_idx  on public.syllabus_textbooks (course_id);
-- 同一科目内で同じISBNは1行に（再スクレイプ時の重複防止）
create unique index if not exists syllabus_textbooks_course_isbn_uidx
  on public.syllabus_textbooks (course_id, isbn13);

comment on table public.syllabus_textbooks is 'ISBN→科目 の逆引き（PB-058 照合用）。scrape-syllabus.mjs が course ごとに再構築する。';

-- 3) RLS + grant（参照系マスタ：authenticated は SELECT のみ、書き込みは service_role）----
alter table public.syllabus_courses   enable row level security;
alter table public.syllabus_textbooks enable row level security;

drop policy if exists "syllabus courses are viewable" on public.syllabus_courses;
create policy "syllabus courses are viewable"
  on public.syllabus_courses for select
  using (true);

drop policy if exists "syllabus textbooks are viewable" on public.syllabus_textbooks;
create policy "syllabus textbooks are viewable"
  on public.syllabus_textbooks for select
  using (true);

-- 既定 grant の是正：anon は不要、authenticated は SELECT のみ（INSERT/UPDATE/DELETE は service_role）。
revoke all on public.syllabus_courses   from anon, authenticated;
revoke all on public.syllabus_textbooks from anon, authenticated;
grant select on public.syllabus_courses   to authenticated;
grant select on public.syllabus_textbooks to authenticated;
-- bigserial のシーケンスも authenticated から書けないよう既定のまま（service_role のみ）。
