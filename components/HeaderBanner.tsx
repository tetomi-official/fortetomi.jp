import Link from "next/link";

// ヘッダー下に出る常時バナーの共通の見た目。
//
// スマホでは 1 行に収める。以前は文言をそのまま折り返していたため 1 本で 90〜110px、
// 3 本同時に出ると約 300px を占有し、--header-h 経由で本文がその分押し下げられていた
// （iPhone SE の画面の半分以上）。スマホ用の短い文言に差し替えて高さを詰めている。
//
// ※「消せるようにする／出し分ける」機能は別タスク。ここでは高さだけ詰める。

export type BannerTone = "alert" | "info" | "warn";

// Tailwind はソースに書かれたクラス名をそのまま探すので、色は文字列を組み立てずに並べて書く。
const TONE_STYLES: Record<BannerTone, { box: string; pill: string }> = {
  alert: { box: "bg-alert-bg border-alert-line text-alert", pill: "bg-alert text-white" },
  info: { box: "bg-info-bg border-info-line text-info", pill: "bg-info text-white" },
  warn: { box: "bg-warn-bg border-warn-line text-warn-ink", pill: "bg-warn-ink text-white" },
};

export default function HeaderBanner({
  tone,
  icon,
  message,
  shortMessage,
  href,
  cta,
  shortCta,
}: {
  tone: BannerTone;
  /** Font Awesome のアイコン名（例: fa-exclamation-triangle） */
  icon: string;
  /** PC 用のフル文言 */
  message: string;
  /** スマホ用の短い文言（1 行に収まる長さで書くこと） */
  shortMessage: string;
  href: string;
  cta: string;
  shortCta: string;
}) {
  const s = TONE_STYLES[tone];
  return (
    <div role="alert" className={`border-b ${s.box}`}>
      <Link
        href={href}
        className="mx-auto flex w-full max-w-[var(--max-w)] items-center gap-2 px-4 py-2 text-xs leading-snug md:justify-center md:gap-2.5 md:py-2.5 md:text-[13px]"
      >
        <i className={`fas ${icon} shrink-0`} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate md:hidden">{shortMessage}</span>
        <span className="hidden md:inline md:flex-none">{message}</span>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap md:text-xs ${s.pill}`}
        >
          <span className="md:hidden">{shortCta}</span>
          <span className="hidden md:inline">{cta}</span>
        </span>
      </Link>
    </div>
  );
}
