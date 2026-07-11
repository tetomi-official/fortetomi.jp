import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記 | TETOMI",
  description: "TETOMI（教科書手渡し取引サービス）の特定商取引法に基づく表記。",
};

// PB-048：特定商取引法に基づく表記（下書き）。
// 事業者名・所在地・連絡先などは運営の実情報が必要。要記入箇所を .todo で明示している。
export default function LegalNoticePage() {
  return (
    <LegalPage title="特定商取引法に基づく表記" updated="2026-07-11">
      <p>
        本ページは、PAY.JP 本番申請（PB-049）に必要な特定商取引法に基づく表記です。以下の
        <span className="todo">要記入</span>箇所に運営の実情報を入力してください。
      </p>
      <table>
        <tbody>
          <tr>
            <th>販売事業者</th>
            <td>
              <span className="todo">要記入（事業者名 / 屋号）</span>
            </td>
          </tr>
          <tr>
            <th>運営責任者</th>
            <td>
              <span className="todo">要記入（代表者氏名）</span>
            </td>
          </tr>
          <tr>
            <th>所在地</th>
            <td>
              <span className="todo">要記入（請求があれば遅滞なく開示する旨を記載可）</span>
            </td>
          </tr>
          <tr>
            <th>連絡先</th>
            <td>
              <span className="todo">要記入（メールアドレス / 電話番号）</span>
            </td>
          </tr>
          <tr>
            <th>販売価格</th>
            <td>各出品ページに表示する価格（税込）に準じます。</td>
          </tr>
          <tr>
            <th>商品代金以外の必要料金</th>
            <td>
              サービス手数料：出品者が販売価格の10%を負担します。振込手数料：250円／回（売上振込申請時）。購入者に送料の負担はありません（対面手渡しのため）。
            </td>
          </tr>
          <tr>
            <th>支払方法</th>
            <td>クレジットカード決済（PAY.JP）</td>
          </tr>
          <tr>
            <th>支払時期</th>
            <td>受け渡し時に出品者が購入者のQRコードを読み取った時点で決済が実行されます。</td>
          </tr>
          <tr>
            <th>商品の引渡時期</th>
            <td>出品者と購入者が調整した日時（キャンパス内・昼休み）に、対面で引き渡します。</td>
          </tr>
          <tr>
            <th>返品・キャンセル</th>
            <td>
              <span className="todo">要記入（受け渡し前のキャンセル可否・受け渡し後の返品対応方針）</span>
            </td>
          </tr>
        </tbody>
      </table>
    </LegalPage>
  );
}
