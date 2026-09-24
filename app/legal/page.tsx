import type { Metadata } from "next";
import type { ReactNode } from "react";
import LegalPage from "@/components/LegalPage";
import { DataRow, RowGroup } from "@/components/ListRow";
import { LEGAL_INFO } from "@/lib/legal-info";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記 | TETOMI",
  description: "TETOMI（教科書手渡し取引サービス）の特定商取引法に基づく表記。",
};

// PB-048 / PB-049：特定商取引法に基づく表記（確定版）。
// 事業者情報は lib/legal-info.ts に集約。変更はそちらで行う。
//
// 項目は下の一覧に1回だけ書き、md 以上は表、md 未満は「左ラベル・右値」の行で出す。
// 値が文章の項目（long）は、スマホではラベルの下に左寄せで置く（右寄せの細い列で長文を読ませない）。
const 項目: { label: string; value: ReactNode; long?: boolean }[] = [
  {
    label: "事業者名称",
    value: LEGAL_INFO.businessName,
  },
  {
    label: "運営統括責任者",
    value: LEGAL_INFO.operator,
  },
  {
    label: "所在地",
    value: LEGAL_INFO.address,
  },
  {
    label: "電話番号",
    value: LEGAL_INFO.phone,
  },
  {
    label: "メールアドレス",
    value: LEGAL_INFO.email,
  },
  {
    label: "サービスURL",
    value: LEGAL_INFO.siteUrl,
  },
  {
    label: "役務の内容",
    long: true,
    value:
      "大学生間の中古教科書を、運営者が販売主体として提供するC2Cマーケットプレイスです。出品者から商品を受託し、購入者に対して販売します。",
  },
  {
    label: "販売価格",
    long: true,
    value: "各商品ページに表示された価格（税込）に準じます。",
  },
  {
    label: "販売価格以外に必要な費用",
    long: true,
    value: (
      <>
        【出品者】販売手数料として販売価格の10%（取引完了時に販売代金から自動的に差し引かれます）。
        銀行口座への入金手数料は運営者が負担するため、出品者の受取額から差し引かれる費用は販売手数料のみです。
        【購入者】なし。
      </>
    ),
  },
  {
    label: "支払方法",
    long: true,
    value: <>クレジットカード（{LEGAL_INFO.cardBrands}）※その他ブランドは順次対応予定</>,
  },
  {
    label: "支払時期",
    long: true,
    value:
      "商品の対面受渡し時に、購入者がQRコードを提示し出品者が読み取ることで即時決済されます。クレジットカードの引き落とし日は、カード会社とお客さまとの契約内容によります。",
  },
  {
    label: "役務の提供時期",
    long: true,
    value: (
      <>
        【出品者】会員登録後、直ちに出品機能をご利用いただけます。
        【購入者】会員登録後、直ちに購入希望機能をご利用いただけます。
      </>
    ),
  },
  {
    label: "商品の引渡し時期",
    long: true,
    value:
      "購入希望成立後、出品者と購入者が合意した日時・場所（大学キャンパス内）にて対面で引渡しを行います。",
  },
  {
    label: "返品・交換について",
    long: true,
    value:
      "決済完了後の返品・交換はお受けできません。対面受渡し時に商品の状態をご確認いただき、QRコード読み取り（決済実行）をもって商品状態への同意とみなします。商品に問題がある場合は、必ず決済実行前にお取引をキャンセルしてください。",
  },
  {
    label: "申込みの撤回について",
    long: true,
    value: "決済実行前であれば、購入希望をキャンセルできます。",
  },
  {
    label: "売上金の入金について",
    long: true,
    value: (
      <>
        取引が完了した時点で、販売代金から販売手数料（10%）を差し引いた金額が、決済会社（
        {LEGAL_INFO.paymentCompanyName}）における出品者名義のアカウントへ送金されます。その後、決済会社が定める入金サイクルに従い、出品者が登録した銀行口座へ自動的に入金されます。運営者が売上金を預かることはありません。残高・入金の予定と履歴の確認、銀行口座の登録・変更は、決済会社の画面から出品者自身が行います。なお、売上金を受け取るには、決済会社での本人確認と受取口座の登録を完了している必要があります。
      </>
    ),
  },
];

export default function LegalNoticePage() {
  return (
    <LegalPage
      title="特定商取引法に基づく表記"
      updated="2026-07-12"
      draft={false}
      mobileRows={
        <RowGroup>
          {項目.map((r) => (
            <DataRow key={r.label} label={r.label} value={r.value} stacked={r.long} />
          ))}
        </RowGroup>
      }
    >
      <table>
        <tbody>
          {項目.map((r) => (
            <tr key={r.label}>
              <th>{r.label}</th>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </LegalPage>
  );
}
