import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/Toast";
import Footer from "@/components/Footer";
import SideTab from "@/components/SideTab";
import BottomTabBar from "@/components/BottomTabBar";
import HeaderStack from "@/components/HeaderStack";
import { ActionRequiredProvider } from "@/lib/action-required";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "TETOMI【教科書取引サービス】",
  description:
    "教科書を手渡しで取引するサービス。送料ゼロ・手数料10%。TETOMIから学部内に新たなつながりを。",
  // iOS で「ホーム画面に追加」時に standalone 起動させる（Apple 系メタ）。
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TETOMI",
  },
  // Next 16 は modern な mobile-web-app-capable を出力する。旧 iOS 向けに
  // 従来名 apple-mobile-web-app-capable も明示して standalone 起動の互換性を広げる。
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#14314A",
  // ノッチ端末で全画面（standalone）時に端まで描画する。
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css"
        />
      </head>
      {/* 下タブバーに隠れないよう本文の下に余白を作る（--bottom-nav-h は PC では 0）。
          legacy.css の * リセット（padding:0）に勝たせるため、utilities レイヤーに乗る
          Tailwind のクラスで指定している。 */}
      <body className="pb-[var(--bottom-nav-h)]">
        <AuthProvider>
          <ActionRequiredProvider>
            <ToastProvider>
              <SideTab />
              <HeaderStack />
              {children}
              <Footer />
              {/* スマホの主動線。?tab= を読むので Suspense で囲う（静的生成の制約）。 */}
              <Suspense fallback={null}>
                <BottomTabBar />
              </Suspense>
            </ToastProvider>
          </ActionRequiredProvider>
        </AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
