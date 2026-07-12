# TETOMI セキュリティ対策まとめ

教科書C2Cマーケットプレイス「TETOMI」（tetomi.jp）で実施しているセキュリティ対策の一覧。
PAY.jp 本番申請（PB-049）にあたって整理した。各項目を「**どんな攻撃・事故を想定し（脅威）→ 何をして（対策）→ なぜ効くか**」で説明する。

決済は「対面でQRを出品者が読み取ると、買い手の保存済みカードに課金される」モデル。
カード番号は一切自社サーバー／DBを通さない設計になっている。

最終更新: 2026-07-12

---

## 1. カード情報の非保持化（トークン化）

- **脅威**: 自社サーバーやDBにカード番号を通す／保存すると、漏えい時に甚大な被害。PCI DSS という重い国際基準の監査対象にもなる。
- **対策**: ブラウザ上の `payjp.js`（PAY.jp のライブラリ）がカード番号を「トークン（使い捨ての引換券）」に変換し、自社サーバーにはトークンだけが届く。
- **なぜ効くか**: カード番号が自社システムを一度も通らない＝漏らしようがない。「非保持化」により PCI DSS の重い監査対象から外れる。
- 実装: [`components/PaymentForm.tsx`](../components/PaymentForm.tsx)、[`app/api/payments/register-card/route.ts`](../app/api/payments/register-card/route.ts)

## 2. EMV 3-Dセキュア（本人認証）＋サーバー再検証

- **脅威**: 盗まれたカード番号での「なりすまし利用」。2025年3月から EC で 3DS が原則必須化。
- **対策**: カード登録時に `payjp.js` の 3DS（iframe型）でカード会社の本人認証を完了させ、認証済みトークンのみ登録を許可。**さらにサーバー側でも** PAY.jp からトークンを取得して `three_d_secure_status` を再検証する。
- **なぜ効くか**: 本人認証を通ったカードだけが登録される。クライアント側の検証は改ざん・迂回されうるため、サーバーで再検証して二重に守る（＝クライアントを信用しない設計）。
- 実装: [`app/api/payments/register-card/route.ts`](../app/api/payments/register-card/route.ts)（`verifyToken3ds`）

## 3. 秘密鍵のサーバー隔離

- **脅威**: PAY.jp の秘密鍵（`sk_...`）が漏れると、第三者が任意の課金・返金を実行できる。
- **対策**: 秘密鍵は `PAYJP_SECRET_KEY`（サーバー専用環境変数）に置き、`NEXT_PUBLIC_` を付けない＝ブラウザに絶対出さない。公開鍵だけをクライアントに露出。
- **なぜ効くか**: ブラウザに配信されるコードやレスポンスから秘密鍵が漏れる経路をそもそも作らない。

## 4. 金額のサーバー再取得（改ざん防止）

- **脅威**: 課金額をクライアントから受け取ると、開発者ツールで「¥3,000→¥1」に書き換えられる。
- **対策**: 課金額はクライアント値を一切信用せず、サーバーが `reservations.price` をDBから取り直して使う。
- **なぜ効くか**: 攻撃者が触れないサーバー側の値だけで課金額が決まる。
- 実装: [`app/api/payments/charge/route.ts`](../app/api/payments/charge/route.ts)

## 5. ワンタイム nonce ＋ ハッシュ保存（QR受け渡し）

- **脅威**: 出品者が予約データを読めるだけで課金できてしまうと、買い手不在でも勝手に課金される。QRの盗み見・使い回しも懸念。
- **対策**: 買い手がQR表示時に「生の nonce（使い捨ての乱数）」を発行し、**DBには SHA-256 ハッシュのみ保存**。課金時に出品者が読み取った生 nonce のハッシュが一致した時だけ課金する。成功したら nonce を消費（null 化）。
- **なぜ効くか**: DBを見ても生 nonce は復元できない（ハッシュは元に戻せない）＝「買い手が実際にQRを提示した」瞬間だけ課金が通る。ワンタイムなので再利用もできない。
- 実装: [`app/api/payments/nonce/route.ts`](../app/api/payments/nonce/route.ts)、[`app/api/payments/charge/route.ts`](../app/api/payments/charge/route.ts)

## 6. 権限チェック（誰が何をできるか）

- **脅威**: 他人の取引を勝手に決済／他人のカードに課金。
- **対策**: 課金は「予約の出品者本人」だけが実行可（`seller_id` 一致）。加えて「承認済み」「未決済」「nonce一致」をサーバーで検証。
- **なぜ効くか**: 認証（ログイン）だけでなく認可（その人にその操作の権利があるか）まで毎回サーバーで確認している。

## 7. RLS と service_role による決済データ隔離

- **脅威**: `payjp_customer_id`（買い手のカードを指す ID）をユーザーが書き換えられると、他人のカードを自分の取引に紐づけて課金できる。
- **対策**: 買い手のカード保存先 `payment_customers` は Supabase の **RLS（行レベルセキュリティ）** を有効化し、本人の SELECT のみ許可・**書き込みは service_role（サーバー）専用**。決済結果の列（`charge_id/paid_at`）もユーザーの UPDATE 権限外。
- **なぜ効くか**: DB自身が「誰がどの行を読み書きできるか」を強制するため、アプリのバグがあってもデータ層で守られる。
- 実装: [`docs/supabase-migration-9-payments.sql`](./supabase-migration-9-payments.sql)

## 8. Webhook の定数時間比較（タイミング攻撃対策）

- **脅威**: 偽の Webhook を送りつけてDBを不正に「決済完了」にする。トークン比較の速度差から正解を推測される（タイミング攻撃）。
- **対策**: PAY.jp の `X-Payjp-Webhook-Token` を環境変数と **`timingSafeEqual`（定数時間比較）** で照合。不一致は 401。
- **なぜ効くか**: 比較にかかる時間が入力に依存しないため、応答時間から秘密を推測できない。Webhook本体は「課金成立したがDB更新に失敗した」ケースの安全網で、冪等（二重処理しない）に設計。
- 実装: [`app/api/payments/webhook/route.ts`](../app/api/payments/webhook/route.ts)

## 9. HTTPセキュリティヘッダ（PB-036 Phase 3・今回追加）

- **脅威**: 通信の盗聴（HTTP降格）、クリックジャッキング（透明iframeに重ねて操作させる）、MIME推測による誤実行、Referer からのURL漏れ。
- **対策**: 全レスポンスに以下を付与（[`next.config.ts`](../next.config.ts)）。
  - `Strict-Transport-Security`（HSTS）— 以後必ずHTTPS接続を強制
  - `X-Frame-Options: SAMEORIGIN` — 他サイトからの iframe 埋め込みを禁止（クリックジャッキング対策）
  - `X-Content-Type-Options: nosniff` — MIME 推測による誤実行を防止
  - `Referrer-Policy: strict-origin-when-cross-origin` — 外部遷移でURL詳細を漏らさない
  - `Permissions-Policy` — 不要なブラウザ機能を封じる（`camera=(self)` はQRスキャナのため自サイトのみ許可）
- **なぜ効くか**: ブラウザ標準の防御機構を有効化して、通信・埋め込み・機能悪用の各面を一律に塞ぐ。

## 10. レート制限（PB-036 Phase 3・今回追加）

- **脅威**: 決済・カード登録・再認証APIの乱発（総当たり、いたずら課金試行、メール爆撃、トークン総当たり）。
- **対策**: 自社APIに、Supabase 上の原子的カウンタによるレート制限を導入。上限超過は `429` を返す。
  - カード登録 10回/10分、nonce発行 30回/10分、課金 30回/10分（いずれもユーザー単位）
  - 再認証メール送信 5回/時（ユーザー単位）、再認証確認 20回/時（IP単位・トークン総当たり対策）
- **なぜ効くか**: サーバーレス（Vercel）でインスタンスをまたいでも効くよう、カウンタをDBに置き `insert ... on conflict` の1文で原子的に加算。ストア障害時は fail-open（正規ユーザーを締め出さない）＋ログ。
- ログイン自体は Supabase Auth（自社API未経由）のため Supabase 側の Rate Limits に委ねる。
- 実装: [`lib/rate-limit.ts`](../lib/rate-limit.ts)、[`docs/supabase-migration-12-rate-limits.sql`](./supabase-migration-12-rate-limits.sql)

## 11. 通信の暗号化（TLS）

- **脅威**: 平文通信の盗聴・改ざん。
- **対策**: 本番は Vercel が全ドメインを自動で TLS（HTTPS）化。HSTS（項目9）でHTTP降格も封じる。

---

## PAY.jp 審査との対応関係

- 審査で技術的に問われる2本柱＝**カード情報の非保持化（項目1）** と **EMV 3-Dセキュア（項目2）** を満たしている。
- 審査は「サイトURLを実際に開いて中身を確認」する層があり、特商法表記・利用規約・プライバシーポリシー・販売条件の掲載が必要（[`/legal`](../app/legal/page.tsx)・[`/terms`](../app/terms/page.tsx)・[`/privacy`](../app/privacy/page.tsx)）。
- HTTPヘッダ（項目9）・レート制限（項目10）は審査の合否項目というより、本番運用で自分を守るためのハードニング。
