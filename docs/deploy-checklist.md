# tetomi.jp 本番公開チェックリスト（404復旧・デモ体験）

このドキュメントは、本番 `tetomi.jp` が全パスで `404: NOT_FOUND` になっていた事象の復旧手順と、
デモデータ／デモログインを本番で成立させるための手順をまとめたもの。

## 背景（何が起きていたか）

- コード・ビルド・本番デプロイは成功していた（`develop`→`main` は PR #10 でマージ済み、Vercel ビルドも success、Production デプロイも completed）。
- しかし **`tetomi.jp` が Vercel プロジェクト `fortetomi-jp` の本番デプロイに割り当てられておらず**、全パスで `x-vercel-error: NOT_FOUND` を返していた。
- さらに本番デプロイ URL には **Deployment Protection（SSO 認証）** がかかっており、一般ユーザーは開けない状態だった。
- デモデータ／デモログインは実装済みだが、本番 Supabase にデータ未投入だと空表示・ログイン失敗になる。

> Vercel プロジェクト名 `fortetomi-jp` は旧称の名残。ドメインは **お名前.com で取得した `tetomi.jp` が正**。プロジェクトの改名は不要。

## 診断コマンド（現状確認）

```bash
# 全パスが x-vercel-error: NOT_FOUND なら「ドメイン未割当」
for p in / /listings /sell /login /terms /privacy /legal; do
  echo "== $p =="; curl -sSI "https://tetomi.jp$p" | grep -iE '^HTTP|x-vercel-error'
done

# GitHub 側の本番デプロイ状況（success / completed か）
gh api repos/tetomi-official/fortetomi.jp/commits/$(git rev-parse origin/main)/status \
  --jq '{state, statuses:[.statuses[]|{context,state}]}'
```

---

## A. Vercel 設定（ダッシュボードで実施）

対象プロジェクト: `tetomitextbook-1449s-projects/fortetomi-jp`

- [ ] **1. ドメイン割当（最優先・404の直接解消）**
  - Settings → Domains に `tetomi.jp`（＋ `www.tetomi.jp`）を追加。
  - `tetomi.jp` が別の／旧 Vercel プロジェクトに登録済みなら、そこから削除して `fortetomi-jp` に付け替える。
  - Production Branch = `main` を確認。
- [ ] **2. お名前.com 側 DNS を Vercel 指示に合わせる**
  - apex `tetomi.jp` … A レコード `76.76.21.21`
  - `www` … CNAME `cname.vercel-dns.com`
  - ※ Vercel の Domains 画面に表示される最新値を優先。追加後に「Valid Configuration」表示を確認。
- [ ] **3. Deployment Protection を本番で無効化**
  - Settings → Deployment Protection → Vercel Authentication を本番ドメインで OFF（またはプレビューのみ保護）。
- [ ] **4. 環境変数（Production スコープ）を設定**
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_PAYJP_PUBLIC_KEY`
  - `PAYJP_SECRET_KEY`
  - `PAYJP_WEBHOOK_TOKEN`
  - `PAYJP_3DS_REQUIRED`
  - `RESEND_API_KEY`
  - `REVERIFY_MAIL_FROM`
  - **`NEXT_PUBLIC_SITE_URL=https://tetomi.jp`** ← `.env.local` に無いので設定漏れ注意（メールリンク／リダイレクトに影響）
- [ ] **5. 再デプロイ**（`NEXT_PUBLIC_*` はビルド時に焼き込まれるため env 変更後は必須）

## B. Supabase 設定（本番プロジェクトの SQL Editor で実施）

- [ ] **1. スキーマ適用を確認**（未適用なら順に実行）
  - `docs/supabase-setup.sql`
  - `docs/supabase-migration-2-profiles-private.sql` 〜 `docs/supabase-migration-12-rate-limits.sql`（番号順）
- [ ] **2. デモデータ投入**
  - `docs/supabase-seed-prod.sql` を SQL Editor に貼り付けて Run（冪等・再実行可）。
  - デモアカウント: `sato@ / tanaka@ / suzuki@ / nakamura@g.chuo-u.ac.jp`（全員 `password123`）。
- [ ] **3. 書影画像の付与（任意）**
  - 本番の Supabase URL / Service Role Key を環境変数に指定して `npm run seed:images` を実行。

## C. 検証（公開後）

- [ ] `curl -sSI https://tetomi.jp/` ほか `/listings` `/sell` `/login` `/terms` `/privacy` `/legal` が **HTTP 200**（`x-vercel-error` が消える）。
- [ ] `/login` の「デモユーザーで試す」→ 各アカウントでログイン成功（トースト「デモユーザーでログインしました」）。
- [ ] ログイン後 `/listings` に自学部の出品が表示される／LP のカウンタが 0 でない。
- [ ] `/terms` `/privacy` `/legal` が内容表示される。
