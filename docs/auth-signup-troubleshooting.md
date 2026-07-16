# 新規登録まわり3症状の原因と対処（メール確認フロー）

新規登録した本物ユーザーで出ていた3症状の原因と、恒久対処をまとめる。
**①はコードで修正済み**（`lib/auth.tsx` の在籍自己修復の競合バグ）。
**②③は Supabase / Vercel ダッシュボードの設定**なので、本書の手順で対応する。

前提: Supabase の **Confirm email（メール確認必須）は ON**。この場合、登録メールのリンクが
正しく `/auth/confirm` に届かないと `email_confirmed_at` が付かず、①の自己修復も救えず、
③のように本物メール経由のユーザーだけドメインで 404 になる — という連鎖になる。

---

## 症状と原因

| # | 症状 | 原因 | 対処 |
|---|------|------|------|
| ① | ログイン後に「大学メールで再認証」バナーが消えない | `AuthProvider.hydrate()` の在籍自己修復の競合バグ | **コード修正済み**（`lib/auth.tsx`） |
| ② | メールのリンクを踏むと「confirm をダウンロード」 | Supabase メールテンプレート／Site URL が本番未設定で、リンクが正しい `/auth/confirm` に届いていない | 本書 A・B |
| ③ | 友達だけログイン後に 404（自分は平気） | `tetomi.jp` の Vercel 割当漏れ／`NEXT_PUBLIC_SITE_URL` 未設定。本物メールのリンク先ドメインが全パス `NOT_FOUND` | 本書 A |

補足:
- `/auth/confirm`（`app/auth/confirm/route.ts`）は**全分岐がリダイレクトを返すだけ**で、ファイルを配る箇所は無い。ダウンロード＝クリックがこのルートに届いていない証拠。
- アプリのルーティングは**ページを 404 にしない**（`proxy.ts` はブロック時トップへリダイレクト、`lib/prerelease.ts` の制限は `/checkout`・`/api/payments` のみ）。③の 404 は Vercel のドメイン割当のインフラ事象。
- 差の理由: 自分はデモログイン（`app/login/page.tsx`）や localhost/プレビュー経由で、本物の登録メールリンク経路を通らない。友達は Supabase の Site URL 由来リンクを踏むので割当漏れにぶつかる。

---

## A. Vercel 設定（`fortetomi-jp` プロジェクト）

詳細は `docs/deploy-checklist.md` を参照。要点:

1. **ドメイン割当（③の直接解消・最優先）**
   Settings → Domains に `tetomi.jp`（＋ `www.tetomi.jp`）を追加。別プロジェクトに登録済みなら付け替える。Production Branch = `main`、`Valid Configuration` 表示を確認。
2. **Deployment Protection を本番で OFF**
   Settings → Deployment Protection → Vercel Authentication を本番ドメインで無効化（プレビューのみ保護）。
3. **環境変数（Production スコープ）に追加**
   `NEXT_PUBLIC_SITE_URL=https://tetomi.jp`（`.env.local` に無い設定漏れ。メールリンク／リダイレクトに影響）。
4. **再デプロイ**（`NEXT_PUBLIC_*` はビルド時に焼き込まれるため env 変更後は必須）。

---

## B. Supabase 設定（②の直接解消）

### B-1. Auth → URL Configuration
- Site URL = `https://tetomi.jp`
- Redirect URLs に `https://tetomi.jp/auth/confirm` を登録

### B-2. Auth → Email Templates
テンプレートを次の形にする（`docs/resend-email-setup.md` と同じ）。既定の `{{ .ConfirmationURL }}` のままだと
リンクが `/auth/confirm` の `token_hash`/`type` 受け口を通らず失敗する。

- Confirm signup → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`
- Confirm email change → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change`
- Reset password → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`

---

## C. 検証

### ①（コード・修正済み）
1. `npm run dev` で起動。
2. デモログイン（`/login`「デモユーザーで試す」）または在籍 NULL のアカウントでログインし、再認証バナー（`components/ReverifyBanner.tsx`）が**一瞬も残らず消える**ことを確認。
3. ネットワークタブで `/api/enrollment/heal` が **1回だけ** POST され `{healed:true}` を返すこと、再読み込み後もバナーが出ないことを確認。
4. 卒業済み等 heal が false になるアカウントでは、バナーが**正しく出る**ことも確認（過剰抑制していない）。

### ②③（設定・切り分けの決定打）
1. 実際に届いた確認メールのリンクを長押しして **URL を確認**:
   - ホストが `tetomi.jp` か
   - `token_hash=` と `type=signup` が付いているか
   - → 付いていない／別ホストなら B-2 のテンプレート未設定（②の直接原因）。
2. ドメイン割当の確認:
   ```bash
   for p in / /login /auth/confirm; do
     echo "== $p =="; curl -sSI "https://tetomi.jp$p" | grep -iE '^HTTP|x-vercel-error'
   done
   ```
   `x-vercel-error: NOT_FOUND` が消えて 200/3xx になること（③の直接原因の解消）。
3. 反映後、テスト用大学メールで新規登録 → メールのリンク → `/?welcome=1` に着地し、バナーが出ないことを一気通貫で確認。
