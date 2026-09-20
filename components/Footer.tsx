import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-navy pt-16 text-white/55">
      <div className="mx-auto grid max-w-[var(--max-w)] grid-cols-1 gap-7 border-b border-white/8 px-5 pb-10 md:grid-cols-[2fr_1fr_1fr] md:gap-12 md:px-6 md:pb-12 lg:px-10">
        <div>
          <div className="font-en mb-3 text-[1.6rem] font-black tracking-[0.14em] text-white">
            TETOMI
          </div>
          <p className="text-xs leading-loose text-white/45">手から手へ、教科書とつながりを。</p>
        </div>
        <div>
          <h4 className="font-en mb-4 text-[10px] font-black tracking-[0.18em] text-white uppercase">
            Service
          </h4>
          <FooterLink href="/listings">教科書を探す</FooterLink>
          <FooterLink href="/sell">出品する</FooterLink>
          <FooterLink href="/mypage">マイページ</FooterLink>
        </div>
        <div>
          <h4 className="font-en mb-4 text-[10px] font-black tracking-[0.18em] text-white uppercase">
            Info
          </h4>
          <FooterLink href="/#about">TETOMIとは</FooterLink>
          <FooterLink href="/#faq">よくある質問</FooterLink>
        </div>
      </div>
      <div className="mx-auto flex max-w-[var(--max-w)] flex-col items-center gap-2 px-5 py-5 text-center text-[11px] md:flex-row md:justify-between md:px-6 md:text-left lg:px-10">
        <p>© 2025 TETOMI. All rights reserved.</p>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1">
          <FooterPolicy href="/terms">利用規約</FooterPolicy>
          <FooterPolicy href="/privacy">プライバシーポリシー</FooterPolicy>
          <FooterPolicy href="/legal">特定商取引法に基づく表記</FooterPolicy>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mb-0.5 block py-2 text-[13px] text-white/45 transition-colors hover:text-white md:mb-2.5 md:py-0"
    >
      {children}
    </Link>
  );
}

function FooterPolicy({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-block py-2.5 text-white/35 transition-colors hover:text-white md:py-0">
      {children}
    </Link>
  );
}
