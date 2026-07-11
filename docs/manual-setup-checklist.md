# 手動作業チェックリスト（コード実装後に人がやる設定）

このセッションで実装した機能を「本番で実際に動く」状態にするために、**コードでは完結できずダッシュボード/DNS/環境変数などの手作業が必要な項目**をまとめる。実装済みコードは各項目のリンク先ドキュメント参照。

最終更新: 2026-07-11（feature/7）

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
3. 買い手：マイページの承認済み予約 → 「受け取り・支払いへ」→ カード登録（テストカード `4242 4242 4242 4242` / 任意の未来の有効期限 / 任意CVC）→ QR表示。
4. 出品者：マイページの承認済み予約 → 「QRを読み取って決済」→ 買い手のQRをスキャン。
5. 確認：決済成功トースト → 予約が「完了」→ 出品が「完了」。PAY.jp ダッシュボードに charge が記録され、`reservations.charge_id / paid_at` が入っていること。

### A-4. 本番前の残作業（次段階・今回スコープ外） ⏸
- 3DSecure 必須化（PDF要件 / Phase 2）、Webhook 署名検証。
- Payouts型（出品者テナント＝口座登録 PB-053 ＋ 資金決済法などPO法務）、手数料・送金（PB-045/046/054/055）。

---

## B. メール送信（Resend / 認証・再認証メール）

登録確認メール（PB-009/010）と再認証メール（PB-015）を本番品質で送るための設定。コード側（再送信ボタン・疎通テスト・env見本）は実装済み。詳細手順は [`docs/resend-email-setup.md`](./resend-email-setup.md)。

### B-1. Resend アカウント & ドメイン認証 ⏸（お名前.com が PO アカウントのため保留中）
- Resend アカウント作成 → ドメイン `fortetomi.jp` 追加。
- 表示された DNS レコード（MX / SPF / DKIM /（任意）DMARC）を **お名前.com**（＝PO管理）に登録 → Resend で Verify。
- お名前.com 固有の注意（短縮ホスト名・「確認画面へ進む→設定する」・反映最大72h）は [`resend-email-setup.md`](./resend-email-setup.md) 参照。

### B-2. Supabase Auth の SMTP を Resend に ☐（B-1 完了後）
- Supabase → Authentication → Emails → SMTP Settings に Resend の SMTP を設定
  （host `smtp.resend.com` / port `465` or `587` / user `resend` / pass = Resend APIキー / 送信元 `no-reply@fortetomi.jp`）。
- Authentication → Rate Limits を引き上げ。
- メールテンプレ確認（Confirm signup / Confirm email change を `{{ .SiteURL }}/auth/confirm?...` 形式、Secure email change は OFF 推奨）。

### B-3. 再認証メール用の環境変数 ☐（B-1 完了後）
- `.env.local`（と本番環境変数）に `RESEND_API_KEY` を設定（任意で `REVERIFY_MAIL_FROM` / `NEXT_PUBLIC_SITE_URL`）。
- 疎通確認：`npm run test:resend -- <自分が受信できるアドレス>`。

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

## 環境変数まとめ（`.env.local` と本番環境変数の両方に）

| 変数 | 用途 | 現状 | 必要な作業 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | 設定済み | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | 設定済み | — |
| `SUPABASE_SERVICE_ROLE_KEY` | 決済/再認証API（admin） | 設定済み | 本番環境変数にも設定 |
| `NEXT_PUBLIC_PAYJP_PUBLIC_KEY` | 決済(公開) | プレースホルダ | **テストキー設定（A-2）** |
| `PAYJP_SECRET_KEY` | 決済(秘密) | プレースホルダ | **テストキー設定（A-2）** |
| `RESEND_API_KEY` | 再認証メール送信 | 未設定 | B-3（ドメイン認証後） |
| `REVERIFY_MAIL_FROM` | 送信元（任意） | 未設定 | 任意 |
| `NEXT_PUBLIC_SITE_URL` | 確認リンクorigin（任意） | 未設定 | 任意（本番URL） |

> 本番（Vercel等）ではサーバー専用変数（`SUPABASE_SERVICE_ROLE_KEY` / `PAYJP_SECRET_KEY` / `RESEND_API_KEY`）を**サーバー環境変数**として設定し、`NEXT_PUBLIC_` を付けないこと。

---

## 関連ドキュメント
- [`docs/resend-email-setup.md`](./resend-email-setup.md) — Resend の詳細手順（B）
- [`docs/supabase-migration-9-payments.sql`](./supabase-migration-9-payments.sql) — 決済マイグレーション（A-1）
- [`.env.example`](../.env.example) — 環境変数の見本
