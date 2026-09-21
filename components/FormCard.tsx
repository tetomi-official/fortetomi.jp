import type { ReactNode } from "react";

/**
 * 入力や案内のひとかたまり。
 *
 * md 以上はこれまでどおりのカード（角丸＋枠＋影。見た目は legacy.css の `.form-card`）。
 * md 未満は案2の決まりどおり囲いをやめ、白い全幅の面にする（上下だけ 1px の線）。
 * 見出しの下線もスマホでは引かない。
 *
 * `form-card` のクラス名は E2E が目印にしているので必ず残すこと
 * （`tests/e2e/fake-camera.mjs`、`05-payment.mjs` などが `.form-card svg` を見ている）。
 */
export default function FormCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const スマホでは囲わない = [
    "max-md:-mx-4 max-md:mb-6 max-md:rounded-none max-md:border-x-0 max-md:px-4 max-md:py-5 max-md:shadow-none",
    "max-md:[&>h2]:mb-4 max-md:[&>h2]:border-b-0 max-md:[&>h2]:pb-0 max-md:[&>h2]:text-[17px] max-md:[&>h2]:tracking-normal",
  ].join(" ");

  return <div className={`form-card ${スマホでは囲わない} ${className}`.trim()}>{children}</div>;
}
