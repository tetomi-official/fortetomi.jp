// ===================================================
// Stripe の拒否コード → 日本語メッセージ
// ---------------------------------------------------
// 買い手・出品者どちらの画面にも出せるよう、取引の内容には触れない
// 一般的な文言にする。
// ===================================================

const MESSAGES: Record<string, string> = {
  card_declined: "カードが利用できませんでした。別のカードをお試しください。",
  insufficient_funds: "残高不足のため決済できませんでした。",
  expired_card: "カードの有効期限が切れています。",
  incorrect_cvc: "セキュリティコードが正しくありません。",
  incorrect_number: "カード番号が正しくありません。",
  processing_error: "カード会社での処理中にエラーが発生しました。もう一度お試しください。",
  fraudulent: "不正利用の疑いがあるため決済がブロックされました。",
  authentication_required: "カード会社による本人認証が必要です。",
};

export function declineMessage(code: string | null | undefined): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  return "決済に失敗しました。カード情報をご確認のうえ、もう一度お試しください。";
}
