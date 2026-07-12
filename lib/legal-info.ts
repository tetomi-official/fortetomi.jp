// 事業者情報（特商法・利用規約・プライバシーポリシーで共有）。PB-048 / 本番申請 PB-049。
// 掲載する確定情報を1か所に集約する。変更時はここだけ直せば全ページに反映される。
export const LEGAL_INFO = {
  /** 事業者名称（屋号：個人事業主） */
  businessName: "TETOMI（個人事業主：近藤稜真）",
  /** 運営統括責任者 */
  operator: "近藤稜真",
  /** 所在地（特商法：請求があれば遅滞なく開示する運用） */
  address: "請求があった場合に遅滞なく開示いたします",
  /** 電話番号（同上） */
  phone: "請求があった場合に遅滞なく開示いたします",
  /** 連絡先メール */
  email: "tetomitextbook@gmail.com",
  /** サービスURL（本番ドメイン） */
  siteUrl: "https://tetomi.jp",
  /** 取扱いクレジットカードブランド */
  cardBrands: "VISA、Mastercard（その他ブランドは順次対応予定）",
  /** PAY.JP Platform（Payouts）ユーザー利用規約 */
  payjpPayoutsTermsUrl: "https://pay.jp/terms/tos-payouts-user.pdf",
} as const;
