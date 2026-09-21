import { sellerNet } from "./constants";
import { applicationFeeAmount } from "./payment-provider/fees";
import { formatSlot, yen } from "./labels";
import { mailButton, mailLayout, mailSteps, mailTable, siteUrl } from "./mail";
import { SUPPORT_CONTACT } from "./support";
import type { CandidateSlot, ReminderKind } from "./types";

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

/**
 * うまくいかないときの連絡先。
 *
 * 当日その場で困るのは「相手が来ない」「QRが読めない」「決済が通らない」の3つ。
 * どれも先にアプリ内で相手に連絡すれば片づくことが多いので、運営の窓口より先に
 * そちらへ誘導する。文面はここ1か所に置き、どのメールでも同じ体裁にする。
 */
function 困ったときは(状況: string): string {
  return `<p style="font-size:13px;color:#374151">
      ${状況}<br />
      解決しないときは運営（<a href="mailto:${SUPPORT_CONTACT}">${SUPPORT_CONTACT}</a>）までご連絡ください。
    </p>`;
}

/**
 * 当日の流れ。日程確定のメール（#57）と受け渡し前のリマインド（#58）で同じものを使う。
 *
 * 2通で書き方が違うと「どちらが正しいのか」を当日その場で迷わせるので、
 * 手順の文言はここ1か所にしか置かない。
 */
function 当日の流れ(d: ReservationMailData, 宛先: "buyer" | "seller"): string {
  const 日時 = 確定した日時(d) ?? "調整した日時";
  const 場所 = d.proposedLocation || d.location;
  if (宛先 === "buyer") {
    return mailSteps([
      `${日時}に「${場所}」へ行き、${d.sellerName} さんと会う`,
      "教科書を受け取り、その場で状態を確かめる",
      "「受け取り・支払い」の画面を開き、QRを出品者に見せる",
      `出品者がQRを読み取ると、その場で登録済みのカードに ${yen(d.price)} が決済されます`,
    ]);
  }
  return mailSteps([
    `${日時}に「${場所}」へ行き、${d.buyerName} さんと会う`,
    "教科書を渡す",
    "マイページの「QRを読み取って決済」を開き、買い手が見せるQRを読み取る",
    `読み取った時点で ${yen(d.price)} の決済が成立し、売上が確定します`,
  ]);
}

/** 受け渡しの明細（教科書・日時・場所・金額）。 */
function 受け渡しの明細(d: ReservationMailData): string {
  return mailTable([
    ["教科書", d.listingTitle],
    ["受け渡し日時", 確定した日時(d) ?? "調整した日時"],
    ["場所", d.proposedLocation || d.location],
    ["金額", yen(d.price)],
  ]);
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
  const 明細 = 受け渡しの明細(d);

  if (宛先 === "buyer") {
    return {
      subject: `【TETOMI】「${d.listingTitle}」の受け渡し日が決まりました`,
      html: mailLayout(
        "受け渡し日が決まりました",
        `<p>${d.sellerName} さんが受け渡しの日程を確定しました。</p>` +
          明細 +
          `<p><strong>支払いは受け渡しの場で行います。</strong>当日の流れは次のとおりです。</p>` +
          当日の流れ(d, "buyer") +
          `<p><strong>現金のやり取りはありません。</strong>出品者にその場でお金を渡す必要はなく、
           求められた場合も渡さないでください。</p>` +
          `<p>QRは支払いカードを登録すると表示されます。当日あわてないよう、先に登録しておいてください。</p>` +
          mailButton("受け取り・支払いの画面へ", checkout(d.reservationId)) +
          困ったときは(
            `出品者が来ない、QRが表示されない、決済が通らない ── こうしたときは、
             まずマイページのメッセージで ${d.sellerName} さんに連絡してください。`,
          ),
      ),
    };
  }
  return {
    subject: `【TETOMI】「${d.listingTitle}」の受け渡し日が決まりました`,
    html: mailLayout(
      "受け渡し日が決まりました",
      `<p>${d.buyerName} さんが提案した日程を承諾しました。</p>` +
        明細 +
        `<p>当日の流れは次のとおりです。</p>` +
        当日の流れ(d, "seller") +
        `<p><strong>現金のやり取りはありません。</strong>その場で代金を受け取らないでください。
         受け取ってしまうと二重に支払わせることになります。</p>` +
        mailButton("マイページで確認する", mypage()) +
        困ったときは(
          `買い手が来ない、QRが読み取れない、決済が通らない ── こうしたときは、
           まずマイページのメッセージで ${d.buyerName} さんに連絡してください。
           教科書はまだ渡さずにおいてください。`,
        ),
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
        `<p>この取引で現金のやり取りは発生していません。</p>` +
        `<p>ご利用ありがとうございました。</p>` +
        mailButton("取引を確認する", mypage()) +
        困ったときは(
          `受け取った教科書が説明と違う、金額が合わないといったときは、
           まずマイページのメッセージで ${d.sellerName} さんに連絡してください。`,
        ),
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
        mailButton("売上・入金を確認する", `${siteUrl()}/sell/connect`) +
        困ったときは(
          `受け渡しの内容について確認したいことがあれば、
           まずマイページのメッセージで ${d.buyerName} さんに連絡してください。`,
        ),
    ),
  };
}

/**
 * 受け渡しの前に出すリマインド（→買い手・出品者の両方）。
 *
 * 日程が決まったあと当日まで何も届かないと、そのまま忘れられて取引が流れる。
 * 当日の流れは日程確定メールと同じものを使い回す（当日の流れ()）。
 */
export function handoverReminderMail(
  d: ReservationMailData,
  宛先: "buyer" | "seller",
  kind: ReminderKind,
): Mail {
  const いつ = kind === "前日" ? "明日" : "あさって";
  const 日時 = 確定した日時(d) ?? "調整した日時";
  const 相手 = 宛先 === "buyer" ? d.sellerName : d.buyerName;
  const 準備 =
    宛先 === "buyer"
      ? `<p><strong>支払いカードの登録はお済みですか。</strong>QRは登録を済ませると表示されます。
         まだのときは${kind === "前日" ? "今夜のうちに" : "当日までに"}登録しておいてください。</p>`
      : `<p><strong>教科書を持って行くのを忘れないでください。</strong>決済は、あなたが買い手のQRを
         読み取った時点で成立します。</p>`;

  return {
    subject: `【TETOMI】${いつ}は「${d.listingTitle}」の受け渡しです`,
    html: mailLayout(
      `受け渡しは${いつ}です`,
      `<p>${相手} さんとの受け渡しが${いつ}（${日時}）に予定されています。</p>` +
        受け渡しの明細(d) +
        準備 +
        `<p>当日の流れは次のとおりです。</p>` +
        当日の流れ(d, 宛先) +
        `<p><strong>現金のやり取りはありません。</strong>${
          宛先 === "buyer"
            ? "その場でお金を渡す必要はなく、求められた場合も渡さないでください。"
            : "その場で代金を受け取らないでください。受け取ってしまうと二重に支払わせることになります。"
        }</p>` +
        (宛先 === "buyer"
          ? mailButton("受け取り・支払いの画面へ", checkout(d.reservationId))
          : mailButton("マイページで確認する", mypage())) +
        困ったときは(
          `都合が悪くなった、場所を変えたい ── こうしたときは、当日を待たずに
           マイページのメッセージで ${相手} さんに連絡してください。`,
        ),
    ),
  };
}
