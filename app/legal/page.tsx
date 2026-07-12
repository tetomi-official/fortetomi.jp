import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { LEGAL_INFO } from "@/lib/legal-info";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記 | TETOMI",
  description: "TETOMI（教科書手渡し取引サービス）の特定商取引法に基づく表記。",
};

// PB-048 / PB-049：特定商取引法に基づく表記（確定版）。
// 事業者情報は lib/legal-info.ts に集約。変更はそちらで行う。
export default function LegalNoticePage() {
  return (
    <LegalPage title="特定商取引法に基づく表記" updated="2026-07-12" draft={false}>
      <table>
        <tbody>
          <tr>
            <th>事業者名称</th>
            <td>{LEGAL_INFO.businessName}</td>
          </tr>
          <tr>
            <th>運営統括責任者</th>
            <td>{LEGAL_INFO.operator}</td>
          </tr>
          <tr>
            <th>所在地</th>
            <td>{LEGAL_INFO.address}</td>
          </tr>
          <tr>
            <th>電話番号</th>
            <td>{LEGAL_INFO.phone}</td>
          </tr>
          <tr>
            <th>メールアドレス</th>
            <td>{LEGAL_INFO.email}</td>
          </tr>
          <tr>
            <th>サービスURL</th>
            <td>{LEGAL_INFO.siteUrl}</td>
          </tr>
          <tr>
            <th>役務の内容</th>
            <td>
              大学生間の中古教科書売買の場・機会を提供するC2Cマーケットプレイスです。出品者と購入者を仲介し、大学キャンパス内での対面受渡し時に決済を行います。
            </td>
          </tr>
          <tr>
            <th>販売価格</th>
            <td>各商品ページに表示された価格（税込）に準じます。</td>
          </tr>
          <tr>
            <th>販売価格以外に必要な費用</th>
            <td>
              【出品者】販売手数料として販売価格の10%（取引完了時に販売代金から自動的に差し引かれます）。
              【出品者】売上金の振込手数料 250円（税抜）／回（振込申請時に売上金から差し引かれます）。
              【購入者】なし。
            </td>
          </tr>
          <tr>
            <th>支払方法</th>
            <td>クレジットカード（{LEGAL_INFO.cardBrands}）</td>
          </tr>
          <tr>
            <th>支払時期</th>
            <td>
              商品の対面受渡し時に、購入者がQRコードを提示し出品者が読み取ることで即時決済されます。クレジットカードの引き落とし日は、カード会社とお客さまとの契約内容によります。
            </td>
          </tr>
          <tr>
            <th>役務の提供時期</th>
            <td>
              【出品者】会員登録後、直ちに出品機能をご利用いただけます。
              【購入者】会員登録後、直ちに購入希望機能をご利用いただけます。
            </td>
          </tr>
          <tr>
            <th>商品の引渡し時期</th>
            <td>
              購入希望成立後、出品者と購入者が合意した日時・場所（大学キャンパス内）にて対面で引渡しを行います。
            </td>
          </tr>
          <tr>
            <th>返品・交換について</th>
            <td>
              対面受渡し時に商品の状態を確認のうえ、QRコード読み取り（決済実行）をもって商品状態への合意とみなします。決済完了後の返品・交換はお受けできません。商品の状態に問題がある場合は、決済実行前にお取引をキャンセルしてください。
            </td>
          </tr>
          <tr>
            <th>申込みの撤回について</th>
            <td>決済実行前であれば、購入希望をキャンセルできます。</td>
          </tr>
          <tr>
            <th>売上金の入金について</th>
            <td>
              取引完了後の売上金は、販売手数料および決済手数料を差し引いた金額がマイページの売上残高に反映されます。出品者はマイページの「振込申請」ボタンより、任意のタイミングで登録銀行口座への振込を申請できます。振込申請後、翌月末を目処にお振込みいたします。振込1回につき250円（税抜）の振込手数料が売上金から差し引かれます。なお、振込申請可能な最低金額は1,000円です。1年以上振込申請がなく売上残高が残っている場合は、金額にかかわらず自動的にお振込みいたします。
            </td>
          </tr>
        </tbody>
      </table>
    </LegalPage>
  );
}
