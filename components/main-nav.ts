// サイト内の主動線。PC の縦タブ（SideTab）とスマホの下タブバー（BottomTabBar）が
// 同じものを指すよう、リンクの定義はここ 1 箇所にまとめる。

export interface MainNavItem {
  href: string;
  /** 下タブバー用の短いラベル */
  label: string;
  /** PC の縦タブなど、幅に余裕がある場所のラベル */
  longLabel: string;
  /** Font Awesome のアイコン名 */
  icon: string;
  /** ログインが必要な行き先（未ログインならログイン画面へ送る） */
  needsAuth?: boolean;
  /** マイページのタブを指す場合の ?tab= の値。現在地の判定に使う。 */
  tab?: string;
  /** 対応待ち件数のバッジを出すか */
  badge?: boolean;
}

export const MAIN_NAV: MainNavItem[] = [
  { href: "/listings", label: "探す", longLabel: "教科書を探す", icon: "fa-magnifying-glass" },
  { href: "/sell", label: "出品", longLabel: "出品する", icon: "fa-plus" },
  {
    href: "/mypage?tab=messages",
    label: "メッセージ",
    longLabel: "メッセージ",
    icon: "fa-comments",
    needsAuth: true,
    tab: "messages",
  },
  {
    href: "/mypage",
    label: "マイページ",
    longLabel: "マイページ",
    icon: "fa-user",
    needsAuth: true,
    badge: true,
  },
];

/** PC の縦タブに出す 2 つ（出品が先）。 */
export const SIDE_TAB_NAV: MainNavItem[] = [MAIN_NAV[1], MAIN_NAV[0]];

/**
 * ログイン系の画面。スマホ（md 未満）では上のヘッダーも下タブバーも出さず、
 * 画面まるごとを入力に使う（案3・docs/mockups/mobile/V3Login.dc.html）。
 * まだログインしていない人が、他の行き先に気を取られずに済むようにするため。
 */
export const AUTH_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/recover",
];
