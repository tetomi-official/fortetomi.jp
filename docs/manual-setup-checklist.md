# 手動作業チェックリスト（コード実装後に人がやる設定）

このセッションで実装した機能を「本番で実際に動く」状態にするために、**コードでは完結できずダッシュボード/DNS/環境変数などの手作業が必要な項目**をまとめる。実装済みコードは各項目のリンク先ドキュメント参照。

最終更新: 2026-07-11（PB-058 学部横断出品・授業紐付け追加）

> 記号：☐ 未対応 ／ ⏸ 保留（外部依存待ち） ／ 記入欄は完了時にチェック。

---

## A. 決済（PB-036 Phase 1 / PAY.jp）

実装済み：カード登録 → 受け渡しQR表示 → 出品者がスキャンで保存済みカードへ課金 → 取引完了。
**この2つ（A-1 / A-2）が済むまで実課金は動かない。**

### A-1. DBマイグレーションの適用 ☐
- 対象SQL：[`docs/supabase-migration-9-payments.sql`](./supabase-migration-9-payments.sql)
  - `reservations` に `charge_id / paid_at / payment_nonce_hash` を追加
  - `payment_customers` 表を新規作成（買い手のPAY.jp Customer保存先・書き込みは service_role のみ）
- 前提：これより前の番号のマイグレーション（setup.sql / migration-2〜）が適用済みであること。
- **実行方法（どれか1つ）**：
  1. **Supabase SQL Editor に貼り付けて実行**（最も簡単・追加認証不要）＝推奨
  2. Supabase MCP コネクタを認証 → `apply_migration` で流す（claude.ai のコネクタ設定、または対話 `claude` の `/mcp` で認証が必要）
  3. Management API：`POST https://api.supabase.com/v1/projects/hvzmvtqvjddizzhbdzdz/database/query`（要 Personal Access Token `sbp_...`）
  4. 直接 `psql` / node-postgres（要 DB接続文字列＝DBパスワード）
- 注意：Supabase SQL Editor は**スクリプト全体を1トランザクションで実行**するため、途中エラーで全ロールバック。
- ※ `SUPABASE_SERVICE_ROLE_KEY`（データAPI用）だけでは DDL は実行**できない**。

### A-2. PAY.jp テストキーの設定 ☐
- 現状 `.env.local` はプレースホルダ（`pk_test_xxxxx` / `sk_test_xxxxx`）。
- PAY.jp ダッシュボード（テスト環境）→「API」からテストキーを取得し設定：
  - `NEXT_PUBLIC_PAYJP_PUBLIC_KEY=pk_test_...`（クライアント露出OK）
  - `PAYJP_SECRET_KEY=sk_test_...`（**サーバー専用・NEXT_PUBLIC_厳禁**）
- 本番公開時は本番キー（`pk_live_ / sk_live_`）＋ PAY.jp 本番申請（PB-049）が別途必要。

### A-3. 疎通テスト（A-1・A-2 完了後） ☐
1. `npm run dev` で起動。
2. 買い手アカウントで購入希望を送る → 出品者アカウントで「この日時で確定」（→ 承認済み）。
3. 買い手：マイページの承認済み予約 → 「受け取り・支払いへ」→ カード名義・メール入力 → カード登録（テストカード `4242 4242 4242 4242` / 任意の未来の有効期限 / 任意CVC）→ **3Dセキュア認証画面が表示され完了** → QR表示。
4. 出品者：マイページの承認済み予約 → 「QRを読み取って決済」→ 買い手のQRをスキャン。
5. 確認：決済成功トースト → 予約が「完了」→ 出品が「完了」。PAY.jp ダッシュボードに charge が記録され、`reservations.charge_id / paid_at` が入っていること。

### A-4. 3Dセキュア（Phase 2・実装済み / PDF要件） ✅コード実装済み・要疎通確認
- カード登録時に payjp.js の 3DS（iframe型）で本人認証を行い、認証済みトークンのみ登録を許可。
  サーバー（`app/api/payments/register-card`）でも token の `three_d_secure_status` を再検証。
- 追加の環境変数は不要（既定で必須）。開発中に一時的に無効化したい場合のみ `PAYJP_3DS_REQUIRED=false`。
- テスト環境でもテストカードで 3DS 画面が出る（本番申請不要）。A-3 の手順3で認証画面が出ることを確認。

### A-5. Webhook（Phase 2・実装済み） ✅コード実装済み・要設定
- エンドポイント：`POST /api/payments/webhook`。用途は「PAY.jpでは課金成立したがDB更新に失敗した」ケースの自動補正（安全網）。
- 設定手順：
  1. `.env.local`（本番は各サーバー環境変数）に `PAYJP_WEBHOOK_TOKEN=任意の十分長い文字列` を設定。
  2. PAY.jp ダッシュボード（テスト環境）→「Webhook」→ URL に `https://<デプロイ先>/api/payments/webhook` を登録。
     ローカル確認は ngrok 等で公開して登録。
  3. 送信ヘッダ `X-Payjp-Webhook-Token` が `PAYJP_WEBHOOK_TOKEN` と一致するよう設定（不一致は 401）。
  4. 購読イベント：`charge.succeeded`（最低限）。`charge.updated` も可。

### A-6. 本番前の残作業（次段階・今回スコープ外） ⏸
- Payouts型（出品者テナント＝口座登録 PB-053 ＋ 資金決済法などPO法務）、手数料・送金（PB-045/046/054/055）。
  ※ Payouts は「申請→有効化→テスト実装」の順（テスト環境でも Platform 申請が前提）。

---

## B. メール送信（Resend / 認証・再認証メール）

登録確認メール（PB-009/010）と再認証メール（PB-015）を本番品質で送るための設定。コード側（再送信ボタン・疎通テスト・env見本）は実装済み。詳細手順は [`docs/resend-email-setup.md`](./resend-email-setup.md)。

> **本番ドメインは `tetomi.jp`**（`fortetomi.jp` は未登録の誤りだった）。DNS は **Vercel** が管理（NS が `*.vercel-dns.com`）。**お名前.com ではない**ため、DNS レコードは Vercel ダッシュボードで追加する。

### B-1. Resend アカウント & ドメイン認証 ✅（2026-07-12 完了）
- Resend アカウント作成 → ドメイン **`tetomi.jp`** 追加。
- 表示された DNS レコード（DKIM `resend._domainkey` / MX・SPF `send` /（任意）DMARC `_dmarc`）を **Vercel の DNS**（tetomi.jp のプロジェクト → Settings → Domains / DNS Records）に登録 → Resend で Verify（緑）。
- 送信元は **`no-reply@tetomi.jp`**。詳細は [`resend-email-setup.md`](./resend-email-setup.md) 参照。

### B-2. Supabase Auth の SMTP を Resend に ☐（本命・未対応）
- Supabase → Authentication → Emails → SMTP Settings に Resend の SMTP を設定
  （host `smtp.resend.com` / port `465` or `587` / user `resend` / pass = Resend APIキー / 送信元 `no-reply@tetomi.jp`）。
- Authentication → Rate Limits を引き上げ。
- メールテンプレ確認（Confirm signup / Confirm email change を `{{ .SiteURL }}/auth/confirm?...` 形式、Secure email change は OFF 推奨）。

### B-3. 再認証メール用の環境変数
- ローカル `.env.local`：`RESEND_API_KEY` / `REVERIFY_MAIL_FROM=TETOMI <no-reply@tetomi.jp>` 設定済み ✅。疎通確認済み（`npm run test:resend`）✅。
- ☐ **本番（Vercel）の環境変数**に `RESEND_API_KEY` / `REVERIFY_MAIL_FROM=TETOMI <no-reply@tetomi.jp>` / `NEXT_PUBLIC_SITE_URL=https://tetomi.jp` を設定。

---

## C. その他 Supabase 手動作業（過去分・未確認なら要対応）

以下は認証・セキュリティ関連で過去に必要とされた手作業。適用済みか不明なら確認する（詳細は認証系メモ／`docs/supabase-setup.sql` 冒頭注意書き）。

- ☐ `docs/supabase-setup.sql` および `migration-2〜` が最新まで適用済みか（#9 の前提）。
- ☐ Auth → URL Configuration に Site URL と Redirect URL(`/auth/confirm`) が登録済みか。
- ☐ Authentication → Leaked Password Protection を ON（要手動）。
- ☐ **パスワード再設定メールのテンプレ（PB-012）**：Authentication → Emails → Templates →「Reset Password」の本文リンクを
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` に変更（signup/email_change と同じ token_hash 形式）。
  ※ これを設定しないと再設定リンクが `/auth/confirm` を通らず、パスワード変更が完了できない。

---

## D. ログイン保持（PB-011）— 手作業は不要、ただし1点注意 ℹ️
- コードのみで完結（DB変更なし）。追加設定は不要。
- **注意**：この機能の導入前からログイン中だったセッション（`tetomi_session_exp` Cookie 無し）は、次回アクセス時に**一度だけ強制ログアウト**される（再ログインで期限Cookieが付与される）。プレローンチのため許容。ユーザー影響を周知する場合のみ留意。

---

## E. シラバス・スクレイピング（PB-056）

実装済み：中央大学シラバスDB（`syllabus.chuo-u.ac.jp`）を巡回して `syllabus_courses` /
`syllabus_textbooks` に保存するスクリプト。将来の PB-058（ISBN→授業名 自動照合）の土台。

### E-1. DBマイグレーションの適用 ☐
- 対象SQL：[`docs/supabase-migration-10-syllabus.sql`](./supabase-migration-10-syllabus.sql)
  - `syllabus_courses`（1科目1行・`id` はシラバスサイトの数値ID）
  - `syllabus_textbooks`（科目×ISBN の逆引き・`isbn13` にインデックス）
  - どちらも RLS 有効・`authenticated` は SELECT のみ・書き込みは service_role。
- 前提：#1〜#9 のマイグレーションが適用済みであること。
- **実行方法**：A-1 と同じ（Supabase SQL Editor に貼り付けて実行＝推奨。`SUPABASE_SERVICE_ROLE_KEY` では DDL 実行不可）。

### E-2. スクレイピング実行（E-1 完了後） ☐
- 動作確認（DB書込みなし・ネットワークのみ）：
  `npm run scrape:syllabus -- --from 1090 --to 1096 --dry-run`
  → 簿記論(id=1092) が `9784502345012` として抽出されればOK。
- 小範囲を実書込み：`npm run scrape:syllabus -- --from 1090 --to 1096`
  → Supabase で `syllabus_courses` / `syllabus_textbooks` に行が入ることを確認。
- 全件取得（実測の最大IDは ~14,700。逐次・404スキップ・再開可）：
  `npm run scrape:syllabus`（数百件ごとに進捗ログ。途中で止めても `--from` で続行可）。
- `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` が必要（既存で設定済み）。
- 注意：礼儀のため既定 `--delay 300`（ms）。短縮するとサイトに負荷。年1回程度の運用想定（年度切替時に再実行）。

---

## F. 教科書→授業 紐付け＋学部横断出品（PB-058 Phase 1）

実装済み：出品時に ISBN からシラバスを照合し、使用学部を選んで**学部横断で出品**、
詳細ページに「この教科書が使われる授業」を表示。照合は `lib/syllabus.ts`（ISBN完全一致）。
※ E（スクレイピング）でデータ投入済みが前提。ISBN不一致時のOCR書名照合（PB-059）は次回。

### F-1. DBマイグレーションの適用 ☐（**/listings 表示に必須**）
- 対象SQL：[`docs/supabase-migration-11-listing-faculties.sql`](./supabase-migration-11-listing-faculties.sql)
  - `listings.faculties text[]` を追加（この出品が表示される学部の集合）＋ GIN インデックス。
  - 既存の出品は「出品者の学部のみ」でバックフィル（従来挙動を維持）。
- 前提：#1〜#10 が適用済みであること。
- **実行方法**：A-1 と同じ（Supabase SQL Editor に貼り付け）。
- ⚠ **注意**：このマイグレーション適用前は、一覧/検索（`/listings`）と学部別件数（LP）が
  `faculties` 列を参照してエラーになる。**コード配備とセットで適用すること**。

### F-2. 動作確認（F-1 ＋ E-2 完了後） ☐
1. `npm run dev` → ある学部の出品者で、複数学部で使われる ISBN（例 `978-4-502-34501-2`）を入力/スキャン
   → 出品フォームに「対象学部」チェックボックスと使われる授業が出る → 2学部選んで出品。
2. 別学部（選んだ学部の1つ）のアカウントで `/listings` → その出品が並ぶ（学部横断）。選ばなかった学部では出ない。
3. 出品詳細ページ → 「この教科書が使われる授業」（学部グループ＋シラバスリンク）が表示。
4. リグレッション：ISBN無し/一致無しの出品は従来どおり出品者学部のみに表示。

### F-3. 対象外（次タスク） ⏸
- PB-057 ISBN API 組み込み調査。
- PB-059 / PB-058 Phase 2：ISBN不一致時に教科書写真を OCR→書名抽出→`references_raw` と曖昧照合→候補提示、
  一致の無い学部でも出品者が手動で授業/学部を追加できるよう拡張。

---

## G. セキュリティ対策（PB-036 Phase 3 / PAY.jp 本番申請）

実装済み：セキュリティヘッダ（`next.config.ts`）／レート制限（Supabase）／特商法・利用規約・プライバシーの確定文言。
対策の全体像は [`docs/security-measures.md`](./security-measures.md) 参照。

### G-1. レート制限のDBマイグレーション適用 ☐
- 対象SQL：[`docs/supabase-migration-12-rate-limits.sql`](./supabase-migration-12-rate-limits.sql)
  - `rate_limits` 表（service_role 専用）＋原子的判定関数 `check_rate_limit()` を作成。
- 前提：#1〜#11 が適用済みであること。**実行方法は A-1 と同じ**（Supabase SQL Editor に貼り付け。`SUPABASE_SERVICE_ROLE_KEY` では DDL 実行不可）。
- 未適用でもアプリは動く（`check_rate_limit` 不在時は fail-open で素通り＝制限が効かないだけ）。**本番では必ず適用すること。**
- （任意）pg_cron を使う場合はSQL末尾コメントの `cron.schedule(...)` を有効化して日次クリーンアップを張れる。

### G-2. セキュリティヘッダの本番確認 ☐
- コードのみで完結（追加設定不要）。デプロイ後、`curl -sI https://tetomi.jp/` で以下が付くことを確認：
  `strict-transport-security` / `x-frame-options` / `x-content-type-options` / `referrer-policy` / `permissions-policy`。
- ⚠ `Permissions-Policy` は `camera=(self)`。QR受け渡しスキャナ（カメラ）が動くことも確認。

### G-3. 法定ページの内容確認 ☐
- [`/legal`](../app/legal/page.tsx)（特商法）・[`/terms`](../app/terms/page.tsx)（利用規約）・[`/privacy`](../app/privacy/page.tsx)（プライバシー）は確定文言を掲載済み（`draft={false}`）。事業者情報は [`lib/legal-info.ts`](../lib/legal-info.ts) に集約。
- ⚠ 規約類に**振込申請・売上残高・銀行口座（Payouts型）**の記述があるが、この機能は現状「未実装（次段階・A-6）」。掲載＝提供の約束になるため、機能提供時期との整合を運営で確認すること。

---

## 環境変数まとめ（`.env.local` と本番環境変数の両方に）

| 変数 | 用途 | 現状 | 必要な作業 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | 設定済み | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | 設定済み | — |
| `SUPABASE_SERVICE_ROLE_KEY` | 決済/再認証API（admin） | 設定済み | 本番環境変数にも設定 |
| `NEXT_PUBLIC_PAYJP_PUBLIC_KEY` | 決済(公開) | プレースホルダ | **テストキー設定（A-2）** |
| `PAYJP_SECRET_KEY` | 決済(秘密) | プレースホルダ | **テストキー設定（A-2）** |
| `PAYJP_3DS_REQUIRED` | 3DS必須化(任意) | 未設定＝既定で必須 | 通常は未設定でOK。開発で無効化する時だけ `false`（A-4） |
| `PAYJP_WEBHOOK_TOKEN` | Webhook検証(秘密) | 未設定 | **設定（A-5）**。PAY.jp側の `X-Payjp-Webhook-Token` と一致 |
| `RESEND_API_KEY` | 再認証メール送信 | 未設定 | B-3（ドメイン認証後） |
| `REVERIFY_MAIL_FROM` | 送信元（任意） | 未設定 | 任意 |
| `NEXT_PUBLIC_SITE_URL` | 確認リンクorigin（任意） | 未設定 | 任意（本番URL） |

> 本番（Vercel等）ではサーバー専用変数（`SUPABASE_SERVICE_ROLE_KEY` / `PAYJP_SECRET_KEY` / `PAYJP_WEBHOOK_TOKEN` / `RESEND_API_KEY`）を**サーバー環境変数**として設定し、`NEXT_PUBLIC_` を付けないこと。

---

## 関連ドキュメント
- [`docs/resend-email-setup.md`](./resend-email-setup.md) — Resend の詳細手順（B）
- [`docs/supabase-migration-9-payments.sql`](./supabase-migration-9-payments.sql) — 決済マイグレーション（A-1）
- [`docs/supabase-migration-10-syllabus.sql`](./supabase-migration-10-syllabus.sql) — シラバス保存テーブル（E-1）／取得は `scripts/scrape-syllabus.mjs`
- [`docs/supabase-migration-11-listing-faculties.sql`](./supabase-migration-11-listing-faculties.sql) — 出品の対象学部 `faculties[]`（F-1・学部横断出品）／照合は `lib/syllabus.ts`
- [`.env.example`](../.env.example) — 環境変数の見本
