"use client";

import { useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import ReverifyBanner from "@/components/ReverifyBanner";
import GraduationSwitchBanner from "@/components/GraduationSwitchBanner";

// Navbar と各バナー（在籍再認証 / 卒業メール切替）を 1 つの固定ヘッダーにまとめる。
// バナーは表示条件・テキスト折り返しで高さが変わるため、スタックの実高さを測って
// CSS 変数 --header-h に反映する。本文（.page-main / .hero-section 等）はこの変数
// 分だけ下げてあるので、バナーが表示されても固定 Navbar の背後に潜り込まない。
export default function HeaderStack() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty("--header-h", `${el.offsetHeight}px`);
    };
    apply();

    // バナーの表示・非表示（子ノードの増減）が高さ変化の主因。MutationObserver は
    // 描画ループに依存せずマイクロタスクで確実に発火するため、バナー切替を取りこぼさない。
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    // 画面幅の変化（バナー文言の折り返し・--nav-h のブレークポイント）を捕捉する。
    window.addEventListener("resize", apply);
    // 対応環境では折り返し等による高さ変化もこれで拾う（未対応なら上記で十分カバー）。
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(el);

    return () => {
      mo.disconnect();
      ro?.disconnect();
      window.removeEventListener("resize", apply);
      root.style.removeProperty("--header-h");
    };
  }, []);

  return (
    <div className="header-stack" ref={ref}>
      <Navbar />
      <ReverifyBanner />
      <GraduationSwitchBanner />
    </div>
  );
}
