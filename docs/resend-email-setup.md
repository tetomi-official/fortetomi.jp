# Resend メール送信 セットアップ手順

TETOMI の認証メールを Resend で送るための手動設定手順。ゼロから追えるチェックリスト形式。

## 背景

- 登録フローは方針B（2段階）で **1登録あたり確認メール2通**（大学メール確認 → 個人メール確認）を消費する。
- 現状の登録確認メールは **Supabase 組み込みメール**（開発用・毎時数通のレート制限）依存でテストですぐ詰まる。
- 再認証(reverify)メールは **Resend の HTTP API 直叩き**で実装済みだが、`RESEND_API_KEY` 未設定だと送信されず開発フォールバック（サーバーログにリンク出力）になる。

**ゴール**: Resend でドメイン認証し、①Supabase Auth の SMTP を Resend に差し替え（登録確認メール）②`RESEND_API_KEY` を設定（reverify メール）。この2経路が同じ `no-reply@fortetomi.jp` で送られる。

> ⚠️ 以下はすべてダッシュボード / DNS の手動作業。コード側の対応（`.env.example`・再送信ボタン・疎通テスト）は実装済み。

---

## 手順

### 1. Resend アカウント作成
- [ ] [resend.com](https://resend.com) でアカウント作成（無料枠 月3,000通 / 日100通）。

### 2. ドメイン追加
- [ ] Resend → **Domains** → **Add Domain** で `fortetomi.jp` を追加。
- [ ] 表示される DNS レコード（MX / SPF TXT / DKIM TXT /（任意）DMARC TXT）を控える。

### 3. お名前.com に DNS レコードを登録
お名前.com Navi → **ドメイン** → **DNS** → **DNSレコード設定** から登録する。

| 種別 | ホスト名（短縮形） | 値 |
|---|---|---|
| MX | `send` | Resend 指定のホスト（優先度も指定値） |
| TXT (SPF) | `send` | `v=spf1 include:amazonses.com ~all`（Resend 表示値をそのまま） |
| TXT (DKIM) | `resend._domainkey` | Resend 表示の長い公開鍵（全文貼付可） |
| TXT (DMARC, 任意) | `_dmarc` | `v=DMARC1; p=none;` 等 |

**お名前.com 固有の注意（つまずきやすい点）**
- [ ] ネームサーバーがお名前.com純正（`01.dnsv.jp` 等）であること。**Cloudflare 等に向いていればそちら側で設定する**（お名前.com の DNS 設定は効かない）。
- [ ] **ホスト名は FQDN でなく短縮形**で入力（Resend は `send.fortetomi.jp` のように FQDN 表示するので、末尾の `.fortetomi.jp` を削って `send` にする）。
- [ ] 各行「追加」後に、**画面最下部の「確認画面へ進む」→「設定する」を押さないと保存されない**（最頻ミス）。
- [ ] 反映は最大72時間（多くは数十分〜数時間）。

### 4. Resend でドメイン検証
- [ ] Resend → Domains → `fortetomi.jp` の **Verify** が全項目 緑（Verified）になるまで待つ。
- [ ] 検証が通ったら **API キー**を発行（Resend → API Keys → Create）。値は一度しか表示されないので保管。

### 5. 消費先①：Supabase Auth の SMTP を Resend に
Supabase → **Authentication** → **Emails** → **SMTP Settings** で Custom SMTP を有効化し入力:

| 項目 | 値 |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465`（SSL）または `587`（STARTTLS） |
| Username | `resend` |
| Password | 手順4の Resend API キー |
| Sender email | `no-reply@fortetomi.jp` |
| Sender name | `TETOMI` |

- [ ] **Authentication → Rate Limits** を引き上げ（既定の毎時数通 → 実運用値へ）。
- [ ] メールテンプレを確認（Authentication → Emails → Templates）:
  - `Confirm signup` → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`
  - `Confirm email change` → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change`
  - **Secure email change は OFF 推奨**（新アドレスのみ確認。ON だと1登録3通になる）。
- [ ] **URL Configuration** の Site URL と Redirect URLs に `/auth/confirm` が登録済みであること。

### 6. 消費先②：reverify API の環境変数
- [ ] `.env.local`（ローカル）と本番（Vercel 等の環境変数）に設定:
  ```
  RESEND_API_KEY=re_xxxxxxxx
  REVERIFY_MAIL_FROM=TETOMI <no-reply@fortetomi.jp>   # 任意
  NEXT_PUBLIC_SITE_URL=https://fortetomi.jp            # 任意（未設定時はリクエストの origin を使用）
  ```
- 見本は [`.env.example`](../.env.example) を参照。

---

## 検証

1. **Resend 単体の疎通**（手順4完了後、SMTP を触る前でも可）:
   ```
   npm run test:resend -- <自分が受信できるアドレス>
   ```
   → `no-reply@fortetomi.jp` からテストメールが届けば、ドメイン認証と API キーは OK。
2. **登録確認メール（SMTP 経由）**: 実際に新規登録を1件通し、①大学メール確認 ②個人メール確認 の2通が **Resend から**届き、`/auth/confirm` → `/signup/complete` → ログインまで通ること。
   - 届かない/期限切れ時は各画面の「確認メールを再送信」ボタンで再送できる（コード実装済み）。
3. **reverify メール**: `/reverify` から「大学メールで再認証する」→ 大学メール宛に実送信されること（`RESEND_API_KEY` 設定後）。

## 関連
- [`.env.example`](../.env.example) — 環境変数の見本
- `app/api/reverify/request/route.ts` — reverify メール送信（Resend HTTP API）
- `scripts/test-resend.mjs` — 疎通テスト
- `app/signup/page.tsx` / `app/signup/complete/page.tsx` — 確認メール再送信ボタン
