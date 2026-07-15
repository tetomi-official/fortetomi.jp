import type { MetadataRoute } from "next";

// PWA マニフェスト（App Router 規約。Next が /manifest.webmanifest を生成し、
// <link rel="manifest"> も自動で挿入する）。「ホーム画面に追加」で standalone 起動になる。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TETOMI【教科書取引サービス】",
    short_name: "TETOMI",
    description:
      "GLOMAC専用の教科書を手渡しで取引するサービス。送料ゼロ・手数料10%。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#14314A",
    theme_color: "#14314A",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
