import Link from "next/link";
import type { Listing } from "@/lib/types";
import { conditionLabel, statusLabel, yen } from "@/lib/labels";

// 出品1件の見た目。1つの <a> で、幅によって形を変える（案2）。
//
// ・md 未満（スマホ）: 囲わずに全幅の行。左に画像 72×96、右にタイトル・科目/出品者・
//   価格＋状態を積む。区切り線は行の「上」に引く。こうすると最終行に線が残らず、
//   :last-child の打ち消しも要らない（md 以上のカードの枠とも喧嘩しない）。
// ・md 以上: 従来どおりのカード（角丸＋枠＋影）。見た目は変えていない。
//
// 状態バッジの色だけは legacy の .condition-* を使う（出品・詳細でも使う共通の色）。

const 状態の色: Record<string, string> = {
  出品中: "text-navy",
  予約済み: "text-navy-mid",
  完了: "text-ink-muted",
};

export default function ListingCard({ item }: { item: Listing }) {
  const c = conditionLabel(item.condition);
  const st = statusLabel(item.status);

  return (
    <Link
      href={`/listings/${item.id}`}
      className={
        "flex gap-3 border-t border-line-light bg-white px-4 py-3 " +
        "md:block md:overflow-hidden md:rounded-lg md:border md:p-0 md:shadow-sm " +
        "md:transition-all md:duration-300 md:ease-[cubic-bezier(0.23,1,0.32,1)] " +
        "md:hover:-translate-y-[5px] md:hover:border-navy/25 md:hover:shadow-lg"
      }
    >
      <span className="flex h-24 w-18 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-linear-to-br from-[#d8dfe5] to-[#e6e9ec] md:h-[170px] md:w-full md:rounded-none">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <i className="fas fa-book text-3xl text-navy/25 md:text-[2.8rem]" aria-hidden="true" />
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col md:block md:px-4 md:pt-3.5 md:pb-4">
        <span className="line-clamp-2 text-[15px] leading-[1.4] font-bold text-navy md:mb-1 md:text-sm">
          {item.title}
        </span>

        <span className="mt-0.5 block truncate text-xs text-ink-muted md:mt-0 md:mb-3 md:text-[11px]">
          {/* Font Awesome の CSS は Tailwind の hidden より強いので span で包んで出し分ける */}
          <span className="hidden md:inline">
            <i className="fas fa-graduation-cap mr-1 text-[0.75rem] text-navy-light" aria-hidden="true" />
          </span>
          {item.subject}
          <span className="md:hidden">・{item.seller_name || "不明"}</span>
        </span>

        <span className="mt-auto flex items-center gap-2 md:mt-0 md:mb-2.5 md:justify-between md:gap-0">
          <span className="text-lg font-black text-navy md:text-[1.35rem]">{yen(item.price)}</span>
          {/* トップの新着は状態を読んでいない（空）。空のバッジだけが残らないようにする。 */}
          {c.label && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap md:px-2.5 md:py-[3px] md:text-[10px] md:font-extrabold ${c.cls}`}
            >
              {c.label}
            </span>
          )}
        </span>

        {/* 出品者と状態は md 以上だけ。スマホでは出品者を科目の行に入れている。 */}
        <span className="hidden items-center justify-between border-t border-line-light pt-2.5 text-[11px] text-ink-muted md:flex">
          <span className="flex items-center gap-[5px]">
            <i className="fas fa-user-circle" aria-hidden="true" />
            {item.seller_name || "不明"}
          </span>
          <span className={`text-[10px] font-bold ${状態の色[item.status] ?? "text-navy"}`}>
            {st.label}
          </span>
        </span>
      </span>
    </Link>
  );
}
