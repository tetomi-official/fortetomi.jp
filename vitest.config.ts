import { defineConfig } from "vitest/config";
import path from "node:path";

// ===================================================
// 単体テストの設定（画面を動かさずに確かめる分）。
//
//   npm test         1回だけ実行
//   npm run test:watch  直したら自動で再実行
//
// 画面ごと通す確認は tests/e2e（puppeteer）の担当。ここでは
// 「計算とルール」だけを相手にするので、ブラウザ環境は用意しない。
// ===================================================
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/__tests__/**/*.test.ts"],
    // 本番の環境変数を読ませない。プレリリース段階の判定など、
    // .env.local の値で結果が変わるテストがあるため。
    env: {},
  },
  resolve: {
    // アプリ側と同じ "@/..." のパス解決（tsconfig.json の paths に合わせる）。
    alias: { "@": path.resolve(__dirname) },
  },
});
