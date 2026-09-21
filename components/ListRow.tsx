import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 案2（リスト型）の共通部品。スマホ（md 未満）のメニューや一覧は、
 * 画面ごとに似て非なる行を作らず、この3つを組み合わせて作る。
 * 見た目の正解は docs/mockups/mobile/V2*.dc.html、決まりは同フォルダの HANDOFF.md。
 *
 *   SectionLabel … 灰色の地に置く見出しの帯
 *   RowGroup     … 白い行のまとまり（上下に 1px の線）
 *   ListRow      … 行そのもの（高さ 52px）
 */

/** 行のまとまりに付ける見出しの帯。灰色の地の上に置く。 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-4 pt-5 pb-2 text-xs font-bold tracking-[0.06em] text-ink-sub">{children}</h2>
  );
}

/**
 * 行のまとまり。上下に 1px の線を引く。
 * 区切り線は行ごとに持たせてあるので、ここでは最終行のぶんだけ打ち消している。
 */
export function RowGroup({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`border-y border-line-light bg-white [&>:last-child_[data-row-line]]:border-b-0 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/**
 * まとまりの中の 1 行。`href` があれば `<a>`、無ければ `<button>` になる。
 *
 * 区切り線は行の全幅ではなくアイコンの右（左 50px）から引く。
 * 16px の余白 + アイコン 20px + 間隔 14px = 50px なので、
 * 線は右側の中身（`data-row-line`）が持っている。
 */
export function ListRow({
  icon,
  label,
  href,
  onClick,
  badge,
  current = false,
  chevron = true,
  tone = "default",
}: {
  /** Font Awesome のアイコン名（例: "fa-book"） */
  icon: string;
  label: ReactNode;
  href?: string;
  onClick?: () => void;
  /** 件数バッジ。0 と undefined は出さない。 */
  badge?: number;
  /** 今開いている行。色を変えて aria-current を付ける。 */
  current?: boolean;
  chevron?: boolean;
  /** "danger" は文字とアイコンを赤にする（ログアウトなど）。 */
  tone?: "default" | "danger";
}) {
  const danger = tone === "danger";
  const outer = [
    "flex w-full items-center gap-[14px] pl-4 text-left text-[15px]",
    current ? "bg-bg-light" : "bg-white",
    danger ? "text-ng-ink" : "text-navy",
  ].join(" ");

  const inner = (
    <>
      <span
        className={`flex w-5 shrink-0 justify-center ${danger ? "text-ng-ink" : "text-ink-mid"}`}
        aria-hidden="true"
      >
        <i className={`fas ${icon} text-[17px]`} />
      </span>
      <span
        data-row-line
        className="flex h-[52px] min-w-0 flex-1 items-center gap-2 border-b border-line-light pr-4"
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {badge ? (
          <span className="flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-navy px-[7px] text-xs font-bold text-white">
            {badge}
          </span>
        ) : null}
        {chevron ? (
          <i className="fas fa-chevron-right shrink-0 text-base text-ink-faint" aria-hidden="true" />
        ) : null}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={outer} aria-current={current ? "page" : undefined}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={outer} aria-current={current ? "page" : undefined}>
      {inner}
    </button>
  );
}
