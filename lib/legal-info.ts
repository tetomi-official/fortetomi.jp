// 事業者情報（特商法・利用規約・プライバシーポリシーで共有）。PB-048 / 本番申請 PB-049。
// 掲載する確定情報を1か所に集約する。変更時はここだけ直せば全ページに反映される。

import { PAYMENT_PROVIDER } from "@/lib/payment-provider/config";

/**
 * 決済会社ごとに変わる表示内容。
 *
 * 取扱ブランドと、出品者が同意すべき決済会社の規約は決済会社で変わるため、
 * 環境変数の切り替えに追随させる。ここを固定値にしておくと、決済会社を
 * 切り替えたときに法定ページだけ古い内容のまま残る。
 */
const PROVIDER_INFO = {
  payjp: {
    cardBrands: "VISA、Mastercard",
    /** PAY.JP Platform（Payouts）ユーザー利用規約 */
    sellerAgreementName: "PAY.JP Platform（Payouts）ユーザー利用規約",
    sellerAgreementUrl: "https://pay.jp/terms/tos-payouts-user.pdf",
  },
  stripe: {
    // Stripe 日本で受け付けられるブランド。PAY.jp より広い。
    cardBrands: "VISA、Mastercard、JCB、American Express、Diners Club、Discover",
    /** Stripe 連結アカウント契約（出品者が受取口座を作る際に同意する） */
    sellerAgreementName: "Stripe 接続アカウント契約",
    sellerAgreementUrl: "https://stripe.com/jp/legal/connect-account",
  },
} as const;

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

  /** 取扱いクレジットカードブランド（決済会社によって変わる） */
  cardBrands: PROVIDER_INFO[PAYMENT_PROVIDER].cardBrands,
  /** 出品者が同意する決済会社の規約（名称） */
  sellerAgreementName: PROVIDER_INFO[PAYMENT_PROVIDER].sellerAgreementName,
  /** 同上（URL） */
  sellerAgreementUrl: PROVIDER_INFO[PAYMENT_PROVIDER].sellerAgreementUrl,

  /**
   * @deprecated sellerAgreementUrl を使うこと。
   * 決済会社が PAY.jp 固定だった頃の名残。互換のため残している。
   */
  payjpPayoutsTermsUrl: PROVIDER_INFO.payjp.sellerAgreementUrl,
} as const;
