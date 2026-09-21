import Link from "next/link";

/**
 * 全画面の下に出る共通のフッター。
 *
 * md 未満は案2「リスト型」（`docs/mockups/mobile/V2Footer.dc.html`）。紺のまま、
 * 高さ 48px の行と白の透過の線で並べる。画面の上のヘッダーに TETOMI とキャッチが
 * 出ているので、スマホではブランドの塊を出さない。
 * md 以上は今までどおりの段組み。見た目は変えていない。
 */

const SERVICE = [
  { href: "/listings", label: "教科書を探す" },
  { href: "/sell", label: "出品する" },
  { href: "/mypage", label: "マイページ" },
];

const INFO = [
  { href: "/#about", label: "TETOMIとは" },
  { href: "/#faq", label: "よくある質問" },
];

const POLICIES = [
  { href: "/terms", label: "利用規約" },
  { href: "/privacy", label: "プライバシーポリシー" },
  { href: "/legal", label: "特定商取引法に基づく表記" },
];

export default function Footer() {
  return (
    <footer className="bg-navy text-white/55">
      {/* ===== md 未満（案2・リスト型） ===== */}
      <div className="pt-3 pb-6 md:hidden">
        <FooterRowGroup label="SERVICE" links={SERVICE} />
        <FooterRowGroup label="INFO" links={INFO} />
        <div className="flex flex-wrap gap-x-4 px-4 pt-4">
          {POLICIES.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex min-h-11 items-center text-[13px] text-white/80"
            >
              {l.label}
            </Link>
          ))}
        </div>
        <p className="px-4 text-xs text-white/60">© 2025 TETOMI. All rights reserved.</p>
      </div>

      {/* ===== md 以上（今までどおり） ===== */}
      <div className="hidden pt-16 md:block">
        <div className="mx-auto grid max-w-[var(--max-w)] grid-cols-[2fr_1fr_1fr] gap-12 border-b border-white/8 px-6 pb-12 lg:px-10">
          <div>
            <div className="font-en mb-3 text-[1.6rem] font-black tracking-[0.14em] text-white">
              TETOMI
            </div>
            <p className="text-xs leading-loose text-white/45">手から手へ、教科書とつながりを。</p>
          </div>
          <FooterColumn title="Service" links={SERVICE} />
          <FooterColumn title="Info" links={INFO} />
        </div>
        <div className="mx-auto flex max-w-[var(--max-w)] items-center justify-between gap-2 px-6 py-5 text-[11px] lg:px-10">
          <p>© 2025 TETOMI. All rights reserved.</p>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1">
            {POLICIES.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="inline-block text-white/35 transition-colors hover:text-white"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/**
 * md 未満の行のまとまり。見出しの帯と、高さ 48px の行を並べる。
 * 区切り線はまとまりの最後の行には引かない。
 */
function FooterRowGroup({
  label,
  links,
}: {
  label: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <div className="px-4 pt-5 pb-1.5 text-xs font-bold tracking-[0.12em] text-white/60">
        {label}
      </div>
      {links.map((l, i) => (
        <Link
          key={l.href}
          href={l.href}
          className={`flex h-12 items-center justify-between px-4 text-sm text-white/90 ${
            i === links.length - 1 ? "" : "border-b border-white/12"
          }`}
        >
          {l.label}
          <i className="fas fa-chevron-right text-xs text-white/50" aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

/** md 以上の段組み。 */
function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h4 className="font-en mb-4 text-[10px] font-black tracking-[0.18em] text-white uppercase">
        {title}
      </h4>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="mb-2.5 block text-[13px] text-white/45 transition-colors hover:text-white"
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
