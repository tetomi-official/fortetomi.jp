# TETOMI — GLOMAC専用 教科書P2P取引サービス

> **手から手へ、教科書とつながりを。**  
> 送料ゼロ・手数料ゼロ。GLOMACの学部内で完結する教科書マッチングサービス。

---

## 🌐 サービス概要

| 項目 | 内容 |
|------|------|
| サービス名 | TETOMI |
| 対象 | GLOMACの学生 |
| コンセプト | 教科書の学部内P2P手渡し取引 |
| 費用 | 手数料ゼロ・送料ゼロ |
| 原型サイト | https://tetomi-for-glomac.studio.site/ |

---

## ✅ 実装済み機能

### 共通
- レスポンシブデザイン（スマホ最適化・モバイルファースト）
- TETOMI ブランドカラー（Navy #14314A / Coral #FF5035）
- Raleway + Noto Sans JP フォント
- オリジナルロゴ画像使用（images/tetomi-logo.webp）
- 固定ナビゲーション（スクロール対応 backdrop-blur）
- 右端サイドCTAタブ（PC表示）
- ログインモーダル（デモユーザー3名）
- Toast通知システム
- フッター（3カラム）

### トップページ (index.html)
- ヒーローセクション（フルビューポート・ロゴ・キャッチコピー）
- スクロールティッカー（ブランドワードループ）
- About セクション（グレー背景）
- 出品数リアルタイム表示
- 特徴説明 ×3（feature-section）
- ダークネイビー引用セクション ×2
- ギャラリースライダー（3枚自動再生）
- 新着出品カード（最大4件・APIから動的取得）
- FAQアコーディオン（5問）
- CTAセクション（出品/探すカード）

### 教科書一覧 (listings.html)
- フルテキスト検索（タイトル・授業名）
- フィルター（状態・価格帯・並び替え）
- グリッド表示 / リスト表示 切り替え
- ページネーション（12件/ページ）
- スケルトンローディング

### 教科書詳細 (detail.html)
- 教科書画像/絵文字表示
- 状態・価格・メタ情報グリッド
- 出品者情報カード（評価・学部）
- 閲覧数カウンター（PATCH API）
- 気になるボタン（ローカルストレージ）
- シェアボタン（Web Share API / URLコピー）
- 購入希望モーダル（日時・場所・メッセージ）

### 出品フォーム (sell.html)
- 3ステップウィザード形式
- Step1: タイトル・授業名・著者・ISBN・コメント
- Step2: 状態セレクター / 価格・場所 / リアルタイム価格表示
- Step3: プレビュー確認 → 出品
- 画像アップロード（最大5枚・ドラッグ&ドロップ対応）
- 編集モード対応（?edit=ID）

### マイページ (mypage.html)
- ダッシュボード（出品中/予約済み/完了の統計）
- 出品中の教科書一覧（編集・削除・完了ボタン）
- 送った購入希望一覧（キャンセル機能）
- 受け取った購入希望一覧（承認/断る/完了ボタン）
- プロフィール編集フォーム

---

## 📁 ファイル構成

```
index.html         トップページ（LP＋新着出品）
listings.html      教科書一覧（検索・フィルター）
detail.html        教科書詳細・購入希望送信
sell.html          出品フォーム（3ステップ）
mypage.html        マイページ（4タブ）
css/
  style.css        共通デザインシステム
js/
  app.js           認証・Toast・共通ユーティリティ
images/
  tetomi-logo.webp 公式ロゴ（原型サイトから取得）
  tetomi-hero.webp ヒーロー背景画像
```

---

## 🗄️ データモデル（RESTful Table API）

### users
| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | text | ユーザーID |
| name | text | 名前 |
| email | text | メールアドレス |
| university | text | 大学名 |
| faculty | text | 学部 |
| grade | text | 学年 |
| rating | number | 評価スコア（デフォルト5.0） |
| rating_count | number | 評価件数 |

### listings
| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | text | 出品ID |
| title | text | 教科書タイトル |
| subject | text | 授業名 |
| author | text | 著者名 |
| isbn | text | ISBN |
| publication_year | text | 出版年 |
| description | text | コメント |
| condition | text | 状態 |
| price | number | 価格 |
| location | text | 受け渡し場所 |
| image_url | text | 画像URL（base64） |
| seller_id | text | 出品者ID |
| seller_name | text | 出品者名 |
| status | text | 出品中/予約済み/完了 |
| views | number | 閲覧数 |
| likes | number | いいね数 |

### reservations
| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | text | 予約ID |
| listing_id | text | 出品ID |
| listing_title | text | 出品タイトル |
| buyer_id | text | 購入希望者ID |
| buyer_name | text | 購入希望者名 |
| seller_id | text | 出品者ID |
| seller_name | text | 出品者名 |
| price | number | 価格 |
| preferred_date | text | 希望日 |
| preferred_time | text | 希望時間帯 |
| preferred_location | text | 希望場所 |
| message | text | メッセージ |
| status | text | 申請中/承認済み/完了/キャンセル |

### likes
| フィールド | 型 | 説明 |
|-----------|-----|------|
| user_id | text | ユーザーID |
| listing_id | text | 出品ID |

---

## 🔗 ページ一覧とURL

| ページ | URL | 説明 |
|--------|-----|------|
| トップ | `index.html` | LP + 新着出品 |
| 一覧 | `listings.html` | 検索・フィルター |
| 詳細 | `detail.html?id={ID}` | 教科書詳細・購入希望 |
| 出品 | `sell.html` | 新規出品 |
| 編集 | `sell.html?edit={ID}` | 出品編集 |
| マイページ | `mypage.html` | ユーザーダッシュボード |

---

## 🎨 デザインシステム

| 要素 | 値 |
|------|----|
| Primary Navy | `#14314A` |
| Accent Coral | `#FF5035` |
| Background Gray | `#E6E7E9` |
| Off White | `#FAFAFA` |
| Font | Raleway + Noto Sans JP |
| Nav Height | 72px（モバイル60px） |

---

## 🚀 デプロイ方法

**Publishタブ**からワンクリックでデプロイできます。

---

## 🔮 今後の改善案

1. **Firebase Authentication** — 大学メールドメイン認証（@glomac.ac.jp）
2. **Cloud Storage** — 実画像アップロード（Firebase Storage / Cloudinary）
3. **リアルタイムチャット** — 購入者・出品者間のメッセージ機能
4. **プッシュ通知** — 購入希望・承認通知
5. **評価システム** — 取引後の相互評価
6. **大学拡張** — GLOMAC以外の大学にも展開
7. **PWA対応** — スマホアプリライクな体験
