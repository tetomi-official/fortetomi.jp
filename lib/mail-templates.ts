import { sellerNet } from "./constants";
import { applicationFeeAmount } from "./payment-provider/fees";
import { formatSlot, yen } from "./labels";
import { mailButton, mailLayout, mailTable, siteUrl } from "./mail";
import type { CandidateSlot } from "./types";

// ===================================================
// 取引の通知メールの文面
// ---------------------------------------------------
// ここに置くのは「データを受け取って件名と本文を返すだけ」の関数。
// 送信も DB 参照もしないので、そのまま単体テストできる（lib/__tests__/mail-templates.test.ts）。
// ===================================================

export type Mail = { subject: string; html: string };

/** メールに載せる取引の情報。呼び出し側が DB から組み立てて渡す。 */
export type ReservationMailData = {
  reservationId: string;
  listingTitle: string;
  price: number;
  buyerName: string;
  sellerName: string;
  /** 受け渡しの候補（買い手が提示した分）。 */
  candidateSlots?: CandidateSlot[];
  /** 確定した候補の位置。未確定なら undefined。 */
  selectedSlot?: number;
  /** 出品者が逆提案した日程。 */
  proposedDate?: string;
  proposedTime?: string;
  proposedLocation?: string;
  location: string;
  message?: string;
};

const mypage = () => `${siteUrl()}/mypage`;
const checkout = (id: string) => `${siteUrl()}/checkout/${id}`;

/** 確定した受け渡し日時を文章にする。確定していなければ null。 */
function 確定した日時(d: ReservationMailData): string | null {
  if (d.proposedDate) return formatSlot(d.proposedDate, d.proposedTime ?? "");
  if (typeof d.selectedSlot === "number" && d.candidateSlots?.[d.selectedSlot]) {
    const s = d.candidateSlots[d.selectedSlot];
    return formatSlot(s.date, s.time);
  }
  return null;
}

/** 購入希望が届いた（→出品者） */
export function purchaseRequestMail(d: ReservationMailData): Mail {
  const 候補 = (d.candidateSlots ?? []).map((s) => formatSlot(s.date, s.time)).join(" / ") || "—";
  return {
    subject: `【TETOMI】「${d.listingTitle}」に購入希望が届きました`,
    html: mailLayout(
      "購入希望が届きました",
      `<p>${d.buyerName} さんから購入希望が届きました。</p>` +
        mailTable([
          ["教科書", d.listingTitle],
          ["価格", yen(d.price)],
          ["受け渡し候補", 候補],
          ["希望場所", d.location],
          ["メッセージ", d.message?.trim() || "（なし）"],
        ]) +
        `<p>マイページの「受け取った購入希望」から、候補日を確定するか別の日程を提案してください。</p>` +
        mailButton("マイページで確認する", mypage()),
    ),
  };
}

/**
 * 受け渡しの日程が決まった。
 * 出品者が候補を確定した場合は買い手へ、買い手が逆提案を承諾した場合は出品者へ届く。
 * やることが違うので、宛先ごとに本文を変える。
 */
export function scheduleConfirmedMail(d: ReservationMailData, 宛先: "buyer" | "seller"): Mail {
  const 日時 = 確定した日時(d) ?? "調整した日時";
  const 明細 = mailTable([
    ["教科書", d.listingTitle],
    ["受け渡し日時", 日時],
    ["場所", d.proposedLocation || d.location],
    ["金額", yen(d.price)],
  ]);

  if (宛先 === "buyer") {
    return {
      subject: `【TETOMI】「${d.listingTitle}」の受け渡し日が決まりました`,
      html: mailLayout(
        "受け渡し日が決まりました",
        `<p>${d.sellerName} さんが受け渡しの日程を確定しました。</p>` +
          明細 +
          `<p><strong>支払いは受け渡しの場で行います。</strong>下のボタンから支払いカードを登録し、
           当日はQRを出品者に見せてください。読み取られた時点で決済されます。</p>` +
          mailButton("受け取り・支払いの画面へ", checkout(d.reservationId)),
      ),
    };
  }
  return {
    subject: `【TETOMI】「${d.listingTitle}」の受け渡し日が決まりました`,
    html: mailLayout(
      "受け渡し日が決まりました",
      `<p>${d.buyerName} さんが提案した日程を承諾しました。</p>` +
        明細 +
        `<p>当日は買い手が出すQRを、マイページの「QRを読み取って決済」から読み取ってください。
         読み取った時点で決済が成立し、売上が確定します。</p>` +
        mailButton("マイページで確認する", mypage()),
    ),
  };
}

/** 出品者が別の日程を提案した（→買い手） */
export function rescheduleProposedMail(d: ReservationMailData): Mail {
  return {
    subject: `【TETOMI】「${d.listingTitle}」に別の受け渡し日程が提案されました`,
    html: mailLayout(
      "別の受け渡し日程が提案されました",
      `<p>${d.sellerName} さんから、別の日程の提案が届きました。</p>` +
        mailTable([
          ["教科書", d.listingTitle],
          ["提案された日時", formatSlot(d.proposedDate ?? "", d.proposedTime ?? "")],
          ["場所", d.proposedLocation || d.location],
        ]) +
        `<p>マイページの「送った購入希望」から、承諾するか断るかを選んでください。</p>` +
        mailButton("マイページで確認する", mypage()),
    ),
  };
}

/** 取引が取りやめになった（→相手方） */
export function reservationCancelledMail(
  d: ReservationMailData,
  取りやめた人: "buyer" | "seller",
): Mail {
  const 名前 = 取りやめた人 === "buyer" ? d.buyerName : d.sellerName;
  return {
    subject: `【TETOMI】「${d.listingTitle}」の取引が取りやめになりました`,
    html: mailLayout(
      "取引が取りやめになりました",
      `<p>${名前} さんが「${d.listingTitle}」の取引を取りやめました。</p>` +
        `<p>受け渡しの予定は無くなりました。請求は発生していません。</p>` +
        mailButton("マイページで確認する", mypage()),
    ),
  };
}

/** 決済が完了した（→買い手） */
export function paymentCompletedBuyerMail(d: ReservationMailData): Mail {
  return {
    subject: `【TETOMI】お支払いが完了しました（${d.listingTitle}）`,
    html: mailLayout(
      "お支払いが完了しました",
      `<p>${d.sellerName} さんとの受け渡しが完了し、登録のカードへ決済されました。</p>` +
        mailTable([
          ["教科書", d.listingTitle],
          ["お支払い金額", yen(d.price)],
          ["お相手", `${d.sellerName} さん`],
        ]) +
        `<p>ご利用ありがとうございました。</p>` +
        mailButton("取引を確認する", mypage()),
    ),
  };
}

/** 決済が完了した（→出品者。手数料と受取額を明示する） */
export function paymentCompletedSellerMail(d: ReservationMailData): Mail {
  const 手数料 = applicationFeeAmount(d.price);
  const 受取額 = sellerNet(d.price);
  return {
    subject: `【TETOMI】売上が確定しました（${d.listingTitle}）`,
    html: mailLayout(
      "売上が確定しました",
      `<p>${d.buyerName} さんへの受け渡しが完了し、決済が成立しました。</p>` +
        mailTable([
          ["教科書", d.listingTitle],
          ["販売価格", yen(d.price)],
          ["サービス手数料（10%）", `− ${yen(手数料)}`],
          ["お受け取り額", yen(受取額)],
        ]) +
        `<p>売上は決済会社（Stripe）のあなたのアカウントへ送られました。残高と入金の予定は
         出品者向けの画面で確認できます。運営が売上金を預かることはありません。</p>` +
        mailButton("売上・入金を確認する", `${siteUrl()}/sell/connect`),
    ),
  };
}
