# Resend メール送信 セットアップ手順

TETOMI の認証メールを Resend で送るための手動設定手順。ゼロから追えるチェックリスト形式。

> ⚠️ **本番ドメインは `tetomi.jp`**（かつて `fortetomi.jp` と誤記していたが、これは未登録の別名。実在・稼働しているのは `tetomi.jp`）。
> **`tetomi.jp` の DNS は Vercel が管理**している（ネームサーバーが `*.vercel-dns.com`）。**お名前.com ではない**ので、DNS レコードは **Vercel ダッシュボード**で追加する。お名前.com に入れても効かない。

## 背景

- 登録フローは方針B（2段階）で **1登録あたり確認メール2通**（大学メール確認 → 個人メール確認）を消費する。
- 現状の登録確認メールは **Supabase 組み込みメール**（開発用・毎時数通のレート制限）依存でテストですぐ詰まる。
- 再認証(reverify)メールは **Resend の HTTP API 直叩き**で実装済みだが、`RESEND_API_KEY` 未設定だと送信されず開発フォールバック（サーバーログにリンク出力）になる。

**ゴール**: Resend でドメイン認証し、①Supabase Auth の SMTP を Resend に差し替え（登録確認メール）②`RESEND_API_KEY` を設定（reverify メール）。この2経路が同じ `no-reply@tetomi.jp` で送られる。

> ⚠️ 以下はすべてダッシュボード / DNS の手動作業。コード側の対応（`.env.example`・再送信ボタン・疎通テスト）は実装済み。

---

## 手順

### 1. Resend アカウント作成 ✅
- [x] [resend.com](https://resend.com) でアカウント作成（無料枠 月3,000通 / 日100通）。

### 2. ドメイン追加 ✅
- [x] Resend → **Domains** → **Add Domain** で **`tetomi.jp`** を追加。
- [x] 表示される DNS レコード（DKIM TXT `resend._domainkey` / MX `send` / SPF TXT `send` /（任意）DMARC TXT `_dmarc`）を控える。

### 3. Vercel に DNS レコードを登録 ✅
`tetomi.jp` は Vercel でホスト（DNS も Vercel 管理）しているため、**Vercel ダッシュボード**でレコードを追加する。

Vercel → 対象プロジェクト（または Account）→ **Domains / DNS Records** から `tetomi.jp` を開き、以下を追加:

| 種別 | Name（ホスト名） | 値 |
|---|---|---|
| TXT (DKIM) | `resend._domainkey` | Resend 表示の長い公開鍵 `p=...`（全文） |
| MX | `send` | Resend 指定のホスト `feedback-smtp.….amazonses.com`（優先度 `10`） |
| TXT (SPF) | `send` | `v=spf1 include:amazonses.com ~all`（Resend 表示値をそのまま） |
| TXT (DMARC, 任意) | `_dmarc` | `v=DMARC1; p=none;` |

**注意点**
- [x] **Name はサブドメイン部分（短縮形）** で入力（`send` / `resend._domainkey` / `_dmarc`）。Resend が `send.tetomi.jp` のように FQDN 表示していても、末尾の `.tetomi.jp` は付けない。
- [x] Content は必ず Resend の**コピーボタンで全文取得**（DKIM の長い鍵・SPF が省略表示されるため手打ち禁止）。
- [x] Vercel の DNS 反映は速い（数分〜）。

> 💡 過去メモにあった「お名前.com で DNS 設定」は**誤り**。`tetomi.jp` のネームサーバーは Vercel を向いているため、お名前.com 側の DNS 設定は無効。

### 4. Resend でドメイン検証 ✅
- [x] Resend → Domains → `tetomi.jp` の **Verify** が全項目 緑（Verified）。
- [x] **API キー**を発行（Resend → API Keys → Create、権限は Sending access / ドメイン `tetomi.jp` 推奨）。値は一度しか表示されないので保管。

### 5. 消費先①：Supabase Auth の SMTP を Resend に ☐（未対応・本命）
Supabase → **Authentication** → **Emails** → **SMTP Settings** で Custom SMTP を有効化し入力:

| 項目 | 値 |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465`（SSL）または `587`（STARTTLS） |
| Username | `resend` |
| Password | 手順4の Resend API キー |
| Sender email | `no-reply@tetomi.jp` |
| Sender name | `TETOMI` |

- [ ] **Authentication → Rate Limits** を引き上げ（既定の毎時数通 → 実運用値へ）。
- [ ] メールテンプレを確認（Authentication → Emails → Templates）:
  - `Confirm signup` → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`
  - `Confirm email change` → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change`
  - **Secure email change は OFF 推奨**（新アドレスのみ確認。ON だと1登録3通になる）。
- [ ] **URL Configuration** の Site URL（`https://tetomi.jp`）と Redirect URLs に `/auth/confirm` が登録済みであること。

### 6. 消費先②：reverify API の環境変数
- [x] ローカル `.env.local` に設定済み:
  ```
  RESEND_API_KEY=re_xxxxxxxx
  REVERIFY_MAIL_FROM=TETOMI <no-reply@tetomi.jp>
  ```
- [ ] **本番（Vercel の環境変数）** にも設定:
  ```
  RESEND_API_KEY=re_xxxxxxxx
  REVERIFY_MAIL_FROM=TETOMI <no-reply@tetomi.jp>
  NEXT_PUBLIC_SITE_URL=https://tetomi.jp   # 任意（未設定時はリクエストの origin を使用）
  ```
- 見本は [`.env.example`](../.env.example) を参照。

---

## 検証

1. **Resend 単体の疎通** ✅（2026-07-12 実施、Gmail 到達確認済み）:
   ```
   npm run test:resend -- <自分が受信できるアドレス>
   ```
   → `no-reply@tetomi.jp` からテストメールが届けば、ドメイン認証と API キーは OK。
2. **登録確認メール（SMTP 経由）** ☐: 手順5完了後、実際に新規登録を1件通し、①大学メール確認 ②個人メール確認 の2通が **Resend から**届き、`/auth/confirm` → `/signup/complete` → ログインまで通ること。
   - 届かない/期限切れ時は各画面の「確認メールを再送信」ボタンで再送できる（コード実装済み）。
3. **reverify メール** ☐: `/reverify` から「大学メールで再認証する」→ 大学メール宛に実送信されること。

## 補足：メール受信について
- `support@tetomi.jp`（`lib/support.ts` の `SUPPORT_CONTACT`）は**送信ドメイン設定だけでは受信できない**。Resend の Enable Receiving は OFF。実際に問い合わせを受けるには MX / 転送設定が別途必要。

## 関連
- [`.env.example`](../.env.example) — 環境変数の見本
- `app/api/reverify/request/route.ts` — reverify メール送信（Resend HTTP API）
- `scripts/test-resend.mjs` — 疎通テスト
- `app/signup/page.tsx` / `app/signup/complete/page.tsx` — 確認メール再送信ボタン
