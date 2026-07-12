import Link from "next/link";

export default function SideTab() {
  return (
    <div className="side-tab" aria-hidden="true">
      <Link href="/sell">出品する</Link>
      <Link href="/listings">教科書を探す</Link>
    </div>
  );
}
