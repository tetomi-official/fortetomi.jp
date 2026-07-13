import Link from "next/link";
import { canReserve, canSell } from "@/lib/prerelease";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-top">
        <div>
          <div className="footer-brand-name">TETOMI</div>
          <p className="footer-brand-tagline">
            手から手へ、教科書とつながりを。
            <br />
            GLOMAC専用 教科書手渡し取引サービス
            <br />
            送料ゼロ・手数料10%
          </p>
        </div>
        <div className="footer-col">
          <h4>Service</h4>
          <Link href="/listings">教科書を探す</Link>
          {canSell && <Link href="/sell">出品する</Link>}
          {canReserve && <Link href="/mypage">マイページ</Link>}
        </div>
        <div className="footer-col">
          <h4>Info</h4>
          <Link href="/#about">TETOMIとは</Link>
          <Link href="/#faq">よくある質問</Link>
        </div>
      </div>
      <div className="footer-bottom" style={{ maxWidth: "var(--max-w)", margin: "0 auto" }}>
        <p>© 2025 TETOMI for GLOMAC. All rights reserved.</p>
        <div className="footer-policies">
          <Link href="/terms">利用規約</Link>
          <Link href="/privacy">プライバシーポリシー</Link>
          <Link href="/legal">特定商取引法に基づく表記</Link>
        </div>
      </div>
    </footer>
  );
}
