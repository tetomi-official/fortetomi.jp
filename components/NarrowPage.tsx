import type { ReactNode } from "react";

/**
 * 決済・受取口座のような、狭い1カラムだけの画面の外枠。
 *
 * 固定ヘッダー（`HeaderStack`）は position:fixed なので、本文の上に `--header-h`
 * の分を確保しないと中身がヘッダーの下に潜る。各画面が `margin: 40px auto` だけを
 * 持っていて潜っていたため（#52）、ここに1か所だけ置いて共有する。
 *
 * 下タブバーぶんの余白は `app/layout.tsx` の body に付いているので、ここでは足さない。
 */
export default function NarrowPage({ children }: { children: ReactNode }) {
  return (
    <main className="bg-bg-light pt-[calc(var(--header-h)+24px)] pb-10 md:bg-transparent md:pt-[calc(var(--header-h)+40px)]">
      <div className="mx-auto w-full max-w-[520px] px-4">{children}</div>
    </main>
  );
}
