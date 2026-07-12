import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/Toast";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SideTab from "@/components/SideTab";
import ReverifyBanner from "@/components/ReverifyBanner";

export const metadata: Metadata = {
  title: "TETOMI【教科書取引サービス】",
  description:
    "GLOMAC専用の教科書を手渡しで取引するサービス。送料ゼロ・手数料10%。TETOMIから学部内に新たなつながりを。",
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
      <body>
        <AuthProvider>
          <ToastProvider>
            <SideTab />
            <Navbar />
            <ReverifyBanner />
            {children}
            <Footer />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
