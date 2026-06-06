import Link from "next/link";
import type { Listing } from "@/lib/types";
import { conditionLabel, statusLabel, yen } from "@/lib/labels";

export default function ListingCard({ item }: { item: Listing }) {
  const c = conditionLabel(item.condition);
  const st = statusLabel(item.status);

  return (
    <Link href={`/listings/${item.id}`} className="listing-card" style={{ display: "block" }}>
      <div className="card-img">
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
      <div className="card-body">
        <p className="card-title">{item.title}</p>
        <p className="card-subject">
          <i
            className="fas fa-graduation-cap"
            style={{ color: "var(--navy-light)", marginRight: 4, fontSize: "0.75rem" }}
          />
          {item.subject}
        </p>
        <div className="card-meta">
          <span className="card-price">{yen(item.price)}</span>
          <span className={`card-condition ${c.cls}`}>{c.label}</span>
        </div>
        <div className="card-footer">
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
