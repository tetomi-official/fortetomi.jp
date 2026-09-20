import Link from "next/link";
import type { User } from "@/lib/types";

// スマホ（md 未満）のマイページ。案1「余白と見出し」。
//   見た目の正解: docs/mockups/mobile-v1/V1Mypage.dc.html
//   きまり:       docs/mockups/mobile-v1/HANDOFF.md
//
// ■ md 未満では画面を 2 枚に分ける（HANDOFF の「挙動の変更」を採用）
//   /mypage          … この「メニュー画面」。行を押すと ?tab=... へ移る
//   /mypage?tab=…    … 中身。上に「← マイページ」の戻るリンクを出す（MypageBackLink）
//   狭い画面にメニューと中身を同時に積むと、目当ての所まで遠くなるため。
//   md 以上は今までどおりサイドバー＋中身の 2 段組みで、ここは使わない。
//
// ■ 箱を作らない
//   枠線・影・背景色でグループを囲まず、余白と見出しだけで区切る。
//   区切り線も引かない。丸いアイコンとバッジだけが背景色を持つ。
//
// ■ 行は Link にしてある
//   サイドバー（md 以上）は router.replace で URL を書き換えるが、こちらは履歴を残す。
//   端末の「戻る」でメニューに戻れるようにして、戻るリンクと動きを揃えるため。

type MenuItem = {
  /** 行き先の ?tab= の値 */
  tab: string;
  /** Font Awesome のアイコン名 */
  icon: string;
  label: string;
};

/** メニューの中身。見出しごとに 2 つに分ける。 */
const SECTIONS: { title: string; items: MenuItem[] }[] = [
  {
    title: "取引",
    items: [
      { tab: "dashboard", icon: "fa-chart-bar", label: "ダッシュボード" },
      { tab: "myListings", icon: "fa-book", label: "出品中の教科書" },
      { tab: "sentRes", icon: "fa-paper-plane", label: "送った購入希望" },
      { tab: "receivedRes", icon: "fa-inbox", label: "受け取った購入希望" },
    ],
  },
  {
    title: "サポート・設定",
    items: [
      { tab: "messages", icon: "fa-comments", label: "メッセージ" },
      { tab: "support", icon: "fa-headset", label: "運営サポート" },
      { tab: "profile", icon: "fa-user-cog", label: "プロフィール編集" },
    ],
  },
];

/** 行の右端に出す件数。0 と未指定は出さない。 */
export type MenuBadges = Partial<Record<string, number>>;

/**
 * 名前・学部学年・評価。箱に入れず、白地にそのまま置く。
 * プレリリース（phase 0）の画面でも同じものを使う。
 */
export function MypageProfile({ user }: { user: User }) {
  return (
    <div className="flex items-center gap-4">
      <span
        aria-hidden="true"
        className="font-en flex size-16 shrink-0 items-center justify-center rounded-full bg-navy/8 text-[22px] font-bold text-navy"
      >
        {(user.name || "?").charAt(0)}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-xl font-black text-navy">{user.name}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink-mid">
          {`${user.faculty} ${user.grade}`.trim()}
          <span className="flex items-center gap-[3px] font-bold text-navy">
            <i className="fas fa-star text-[12px]" aria-hidden="true" />
            {user.rating}
          </span>
          （{user.rating_count}件）
        </span>
      </div>
    </div>
  );
}

/** ログアウト。白背景で読める赤（--color-ng は 4.5:1 に足りないので ng-ink を使う）。 */
export function MypageLogout({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center gap-2 self-start text-[15px] font-bold text-ng-ink"
    >
      <i className="fas fa-sign-out-alt text-[18px]" aria-hidden="true" />
      ログアウト
    </button>
  );
}

/** タブの中身を開いているときに上に出す戻るリンク。高さ 44px を確保する。 */
export function MypageBackLink() {
  return (
    <Link
      href="/mypage"
      className="mb-2 flex h-11 items-center gap-2 text-sm font-bold text-navy md:hidden"
    >
      <i className="fas fa-chevron-left text-xs" aria-hidden="true" />
      マイページ
    </Link>
  );
}

export default function MypageMenu({
  user,
  badges,
  onLogout,
}: {
  user: User;
  badges: MenuBadges;
  onLogout: () => void;
}) {
  return (
    <div className="flex flex-col gap-8 md:hidden">
      <MypageProfile user={user} />

      {SECTIONS.map((section) => (
        <section key={section.title} className="flex flex-col gap-1">
          <h2 className="mb-1 text-[17px] font-black text-navy">{section.title}</h2>
          {section.items.map((item) => {
            const badge = badges[item.tab];
            return (
              <Link
                key={item.tab}
                href={`/mypage?tab=${item.tab}`}
                className="flex h-14 items-center gap-3.5 text-[15px] font-medium text-navy"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#eef2f5] text-navy">
                  <i className={`fas ${item.icon} text-[18px]`} aria-hidden="true" />
                </span>
                <span className="grow">{item.label}</span>
                {badge ? (
                  <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-navy px-[7px] text-xs font-bold text-white">
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </section>
      ))}

      <MypageLogout onClick={onLogout} />
    </div>
  );
}
