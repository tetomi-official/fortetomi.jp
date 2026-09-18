# DB の変更と開発の手順

DB（Supabase）の中身は、すべて `supabase/` の中のファイルで管理する。
**ダッシュボードの SQL Editor に SQL を貼って本番を変えることはもうしない。**

| 場所 | 中身 |
|---|---|
| `supabase/schemas/` | 本番の「今の姿」。テーブル・関数・ポリシー・権限などを種類ごとに分けて置く。読み込む順番は `supabase/config.toml` の `schema_paths` に書いてある |
| `supabase/migrations/` | 本番に当てた変更の記録。1ファイル＝1回の変更。本番にはこれを順に当てる |
| `supabase/seed.sql` | 手元の DB に入れる開発用データ（全員パスワード `password123`） |
| `supabase/tests/` | pgTAP のテスト。「見せてはいけないものが見えない」「見せるものは見える」を確かめる |
| `lib/database.types.ts` | DB から自動で作る型。手で書き換えない |
| `docs/supabase-seed-prod.sql` | 本番デモ用のデータ（これだけは今も SQL Editor で流す） |
| `docs/archive/sql/` | 昔の SQL。もう使わない（[README](./archive/sql/README.md)） |

---

## 1. 手元で開発する

本番に一切触らずに、全機能を手元で試せる。Docker が動いていること。

```bash
npm run db:start    # 手元の Supabase を起動（初回は時間がかかる）
npm run db:reset    # migrations を最初から当て直し、seed.sql を入れる
npm run dev:local   # 手元の Supabase につないで next dev を起動
```

- `dev:local` は `.env.local` を書き換えない。接続先（URL・キー）だけを手元のものに差し替えて起動する。
- 普段の `npm run dev` は `.env.local` のとおり**本番の Supabase** につながるので注意。
- 手元のデータを最初の状態に戻したいときは `npm run db:reset`。

---

## 2. DB を変更する

1. **`supabase/schemas/` の該当ファイルを直す。**
   新しいテーブルなら `02_tables/`・`04_policies/`・`09_grants/` などにファイルを足す。
   新しいフォルダを作ったら `config.toml` の `schema_paths` にも足す。
2. **migration を作る。**
   ```bash
   npm run db:sync -- <変更の名前>     # 例: npm run db:sync -- add_listing_memo
   ```
   中身は `supabase db schema declarative sync --no-apply --name <変更の名前>`。
   「migrations を全部当てた姿」と「schemas に書いた姿」を比べて、差を
   `supabase/migrations/<日時>_<変更の名前>.sql` に書き出す（手元の DB は変えない）。

   > **`supabase db diff` は使わない。** 名前が似ているが、あちらは「migrations」と
   > 「今動いている手元の DB」を比べるもので、`supabase/schemas/` を見ない。
   > schemas を直しただけでは「No schema changes found」になる（2026-09-18 に手順を試して判明）。

3. **できたファイルを必ず読む。** diff はよく間違える（→ 3章）。
   足りない文・順番がおかしい文は手で直す。
4. **手元で当て直して、テストを通す。**
   ```bash
   npm run db:reset
   npm run db:test
   ```
5. **型を作り直す。**
   ```bash
   npm run db:types
   ```
6. **コミットする**（schemas・migration・型・テストをまとめて）。
7. **本番に当てる。** まず何が当たるかだけを確認し、問題なければ本番に当てる。
   ```bash
   npx supabase db push --dry-run --db-url "<本番の接続文字列>"
   npx supabase db push --db-url "<本番の接続文字列>"
   ```
   接続文字列はダッシュボードの「Connect」から取る。**パスワードが入っているので、チャットや git に書かないこと。**

---

## 3. diff では正しく出ないもの（手で直す）

migration を自動で作る道具は、次のものを出さなかったり、おかしな形で出したりする。今回の移行で実際に起きたこと。
(a)(b) は最初の migration（baseline）を `db diff` で作ったときに起きた。`declarative sync` でも、**権限の文が出たら順番と中身を必ず読む**こと。

| 起きたこと | 理由 | 対処 |
|---|---|---|
| (a) 余計な権限が残る | public にテーブルや関数を作った瞬間、Supabase が anon・authenticated に全権限を自動で付ける。diff はこれをはがす文を出さない | `schemas/09_grants/001_revoke_defaults.sql` で最初に全部はがし、そのあと必要な権限だけ付け直す。新しいテーブル・関数を足したらここにも足す |
| (b) 列ごとの権限が消える | diff の出力順が悪く、「列ごとの権限を付ける」→「テーブルの権限をはがす」の順になり、後の文で列の権限まで消えた | baseline の権限の部分を `schemas/09_grants/` の内容で差し替えた。権限を触る migration は、はがす文を先・付ける文を後に並べ直す |
| (c) バケットは schemas に書けない | Storage のバケットは `storage.buckets` の「行」（データ）。`declarative sync` は schemas にデータの文があると「declarative files must not contain data statements」で止まる | バケットは migration にだけ書く（今の定義は `20260918040927_baseline.sql` の末尾）。足す・変えるときは migration に `insert` / `update` を手で書く。`schemas/08_storage/010_buckets.sql` は説明だけ |
| (d) 二度流すと失敗する | publication（リアルタイム配信）への追加は、すでに入っていればエラーになる | `schemas/09_grants/900_publication.sql` のように「すでにあれば何もしない」形で書く |
| (e) auth.users のトリガーが無い | public の外（auth スキーマ）にあるので、本番の中身を書き出しても含まれない | `schemas/06_triggers/900_auth_users.sql` に手で書いた。触るときは migration にも手で書く |

---

## 4. 権限を絞る前に確認すること

権限を外す前に、その関数・テーブルが **RLS ポリシー・他の関数・`lib/`・`app/`** から使われていないか grep で確かめる。

```bash
grep -rn "is_enrollment_active" supabase/schemas lib app
```

**実際に起きた失敗（2026-09-18）**：`is_enrollment_active` を anon から外したら、ログインなしで見る出品一覧が空になった。
listings の「見てよい行」を決めるポリシーがこの関数を呼んでいたため。同じ日に戻した
（`20260918063915_restore_anon_is_enrollment_active.sql`）。

テストは両方向を通すこと。

- 「見せない」テスト：見えてはいけない人に見えないか
- 「見せる」テスト：見えるべき人（ログインなしを含む）に見えるか

片方だけだと、今回のように「塞ぎすぎ」に気づけない。

---

## 5. なぜ `--linked` ではなく `--db-url` を使うのか

`npx supabase link` してから `--linked` で当てるのが普通だが、本番プロジェクトでは
CLI が使う一時的なロール `cli_login_postgres` を作るところで権限エラーになる
（そのロールは存在しない。Supabase 側の問題）。

`--db-url` で接続文字列を直接渡すのは正規のやり方で、CI でも同じ方法を使う。
Supabase のサポートへの問い合わせはしてもしなくてもよい。

**接続文字列にはパスワードが入っている。チャット・git・メモに残さないこと。**

---

## 6. 本番の適用履歴（帳簿）の経緯

`supabase db push` は、本番の `supabase_migrations.schema_migrations`（どの migration を当てたかの帳簿）を見て、まだ当てていないものだけを当てる。

移行前、この帳簿には 2026-06-28 に MCP の `apply_migration` で当てた 7 件が残っていた。
中身は当時の docs の SQL と同じ。

| 帳簿に残っていた番号 | 名前 | 元の docs の SQL |
|---|---|---|
| 20260628055525 | reservation_reschedule | migration-3-reservation-reschedule |
| 20260628060343 | fix_listings_grants | migration-4-listings-grants |
| 20260628060919 | table_grants_hardening | migration-5 |
| 20260628061355 | lock_unused_tables | migration-6 |
| 20260628061512 | revoke_trigger_fn_execute | migration-7 |
| 20260628062853 | reservation_candidate_slots | migration-8 |
| 20260628145213 | messages | migration-9-messages |

これらは `supabase/migrations/` に無いので、`migration repair --status reverted` で帳簿から外した
（帳簿の行を消すだけで、DB の中身は変わらない）。それ以外の docs の SQL は SQL Editor で貼っていたので、帳簿には載っていない。

そのうえで次の 3 件を記録・適用した。

| migration | 本番への当て方 |
|---|---|
| `20260918040927_baseline.sql` | 本番の移行時点の姿そのもの。**本番には流さず**、`migration repair --status applied` で「当てた」とだけ記録した |
| `20260918041649_fix_grant_gaps_and_drop_prototypes.sql` | `db push` で適用 |
| `20260918063915_restore_anon_is_enrollment_active.sql` | `db push` で適用 |

---

## 7. 移行のときに本番で見つけて片付けたもの

- **試作テーブル `books` / `users`**（どちらも 0 行）：削除した。
- **試作バケット `book-images`**（0 件）：Storage の API で削除した。SQL からは `storage.protect_delete` に止められて消せない。
- **`check_rate_limit` が誰でも呼べた**：PUBLIC 経由で anon からも呼べる状態だったので塞いだ。

---

## 8. 入れていないもの

- **Branching（本番とは別の検証用 DB を自動で作る仕組み）**：有料で、1人開発では効果が薄いので入れていない。
  代わりに手元の DB（1章）で確かめる。
- **`pg_graphql`**：本番に入っているので、それに合わせて入れている。閉じるかどうかは土台が固まってから決める。
