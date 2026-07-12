import type { NextConfig } from "next";

// 全レスポンスに付与する防御的セキュリティヘッダ（PB-036 Phase 3 / PAY.jp 本番申請）。
// 目的別の解説は docs/security-measures.md を参照。
//
// ⚠ camera は QR受け渡しスキャナ（components/BarcodeScanner.tsx の getUserMedia）が使うため
//   camera=(self) とする。camera=() で塞ぐとスキャナが動かなくなる（回帰注意）。
// ⚠ X-Frame-Options は「当サイトが他所に埋め込まれる」ことだけを禁じる。当サイトが埋め込む
//   payjp.js / 3DS の iframe には影響しないので決済は壊れない。
const securityHeaders = [
  // 以後この配信元へは必ず HTTPS で接続させる（盗聴・中間者対策）。2年 + サブドメイン + preload。
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // クリックジャッキング（透明 iframe に重ねてクリックさせる攻撃）対策。
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Content-Type を無視した MIME 推測による誤実行を防ぐ。
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 外部遷移時に送る Referer を最小化（URL の詳細を漏らさない）。
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 不要なブラウザ機能を封じる。camera は自サイトのみ許可（QRスキャナ用）。
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  // 親ディレクトリにも lockfile があるため、ワークスペースルートを明示する
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        // 全ページ・API に適用する。
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
