import Link from "next/link";
import type { Listing } from "@/lib/types";
import { conditionLabel, statusLabel, yen } from "@/lib/labels";

// md 未満は案1（docs/mockups/mobile-v1/V1Listings.dc.html）。枠も影も付けず、
// 画像（高さ150px・角丸10px）の下に文字を直に置く。md 以上は今までのカードのまま。
export default function ListingCard({ item }: { item: Listing }) {
  const c = conditionLabel(item.condition);
  const st = statusLabel(item.status);

  return (
    <Link
      href={`/listings/${item.id}`}
      className="listing-card block max-md:flex max-md:flex-col max-md:gap-2 max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none"
    >
      <div className="card-img max-md:h-[150px] max-md:rounded-[10px]">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.title} loading="lazy" />
        ) : (
          <i
            className="fas fa-book"
            style={{ color: "var(--navy)", opacity: 0.25, fontSize: "2.8rem" }}
          />
        )}
      </div>
      <div className="card-body max-md:flex max-md:flex-col max-md:gap-0.5 max-md:p-0">
        <p className="card-title max-md:mb-0 max-md:text-sm">{item.title}</p>
        <p className="card-subject max-md:mb-0 max-md:text-xs">
          {/* md 未満はアイコンを出さない。Font Awesome の CSS はレイヤー外＝Tailwind より強いので、
              <i> に hidden を付けても効かない。囲んだ <span> 側で消す。
              md 以上では span を contents にして、<i> が今までどおり flex の子になるようにする。 */}
          <span className="contents max-md:hidden">
            <i
              className="fas fa-graduation-cap"
              style={{ color: "var(--navy-light)", marginRight: 4, fontSize: "0.75rem" }}
            />
          </span>
          {item.subject}
        </p>
        <div className="card-meta max-md:mt-0.5 max-md:mb-0">
          <span className="card-price max-md:text-lg">{yen(item.price)}</span>
          <span className={`card-condition ${c.cls} max-md:px-2 max-md:py-0.5 max-md:text-xs max-md:whitespace-nowrap`}>
            {c.label}
          </span>
        </div>
        {/* 出品者・状態の行は md 未満では出さない（案1は画像の下を最小限にする） */}
        <div className="card-footer max-md:hidden">
          <span className="card-seller">
            <i className="fas fa-user-circle" />
            {item.seller_name || "不明"}
          </span>
          <span className={`card-status ${st.cls}`}>{st.label}</span>
        </div>
      </div>
    </Link>
  );
}
