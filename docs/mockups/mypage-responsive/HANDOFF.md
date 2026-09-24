# マイページ レスポンシブ修正 — 実装ハンドオフ

> **2026-09-20 更新**: md（768px）未満のスマホ表示は `docs/mockups/mobile/HANDOFF.md`（案2「リスト型」）で置き換え。このファイルの「≤480px」の指定と `Main.dc.html` は使わない。タブレット（768〜1024px、`TabletA.dc.html`）の指定は有効。

## 対象
- `app/mypage/page.tsx`（`.mypage-sidebar` / `.sidebar-nav` / `navItem()` 周辺、ログイン後・未ログイン後どちらのサイドバーも）
- `app/legacy.css`（MYPAGE ブロック 369〜402行付近、`@media (max-width:1024px)` 580〜590行付近、768px / 480px ブロック）

## 現状の不具合（原因）
`@media (max-width:1024px)` で `.sidebar-nav` を `flex-wrap` の横並びにし、`.sidebar-nav-item` に `flex:1; min-width:100px; justify-content:center` を指定している。
PC用の `padding: 13px 20px`・アイコン幅・`.pending-dot`（margin-left:auto）が残るため、1項目約120px幅でテキスト領域が10px前後になり、文字が1字ずつ縦に折り返す。
プロフィール部分も PC と同じ縦積み（アバター72px）のままで、スマホでメニューより上が高すぎる。

## 採用案: 案A（見た目は `Main.dc.html` = スマホ390px、`TabletA.dc.html` = タブレット768px）
`MobileB.dc.html` は不採用の比較案（横スクロールタブ）。実装しない。

### ≤1024px
- `.mypage-sidebar`: `position: static`（現状どおり）
- `.sidebar-profile`: 横並びにする
  - `display:flex; align-items:center; gap:16px; padding:20px 24px; text-align:left`
  - `.sidebar-avatar`: 56px、`margin:0`、`flex-shrink:0`
  - 名前ブロック（name / univ / rating）は `flex-grow:1; min-width:0`。univ と rating は同じ行に並べる
  - 右端に「プロフィール編集」ボタン（高さ44px、白30%の枠線、透明背景、白文字）→ `goTab("profile")`
- `.sidebar-nav`:
  - `display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:1px; background:var(--border-light); padding:0`
  - プロフィール編集はヘッダーのボタンに移すので、この幅ではグリッドから除外（6項目＝3列×2行）
- `.sidebar-nav-item`:
  - `height:56px; padding:0 18px; justify-content:flex-start; min-width:0; background:var(--white); border-left:none; border-bottom:none`
  - ラベルは `flex-grow:1`、バッジは右端
  - active: `background:#eef2f5; box-shadow: inset 3px 0 0 var(--navy); color: var(--navy)`
- ログアウト行: `grid-column:1 / -1; height:48px; justify-content:center`

### ≤480px
- `.sidebar-nav`: `grid-template-columns:repeat(2, minmax(0,1fr))`
- `.sidebar-nav-item`: `padding:0 14px`
- `.sidebar-profile`: `padding:16px; gap:12px`、アバター48px
- プロフィール編集ボタン: アイコンのみ 44×44（`aria-label="プロフィール編集"`）

### 付随修正
- ログアウトの赤 `#ef4444` → `#c53030`（白背景でコントラスト 4.5:1 を満たすため）
- `.sidebar-nav-item` を `<div onClick>` から `<button type="button">` に変更。選択中は `aria-current="page"`。ボタンのデフォルトスタイル（border / background / font）をリセットすること
- `<nav aria-label="マイページメニュー">` を付ける

### 変えないもの
- 1025px以上のPCレイアウト（左サイドバー260px）は現状維持
- タブ切り替えロジック・バッジの件数計算は触らない

## 確認
- 幅 1280 / 1024 / 768 / 390 / 360 で表示し、メニュー文字が折り返さないこと
- 「受け取った購入希望」にバッジが付いた状態（例: 12件）でも360pxで1行に収まるか確認。収まらない場合はラベルを2行まで許容（`line-height:1.3`）
