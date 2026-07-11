import { createClient } from "@/lib/supabase/client";

// アプリ内通知（PB-031）。メール/プッシュ基盤は未整備のため、
// 「自分の対応が必要な件数」をDBから集計してヘッダーのバッジで知らせる軽量実装。
//   - 出品者：新しく届いた購入希望（status「申請中」）→ 承認/日程調整の対応が必要。
//   - 買い手：出品者から日程の逆提案が来た希望（status「日程調整中」）→ 承諾の返事が必要。
// RLS により reservations は buyer/seller 本人の行のみ閲覧できるため、集計も本人分に限られる。

/** ヘッダーに出すバッジ件数（自分の対応待ちの購入希望の合計）。 */
export async function fetchActionRequiredCount(userId: string): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .or(
      // 出品者宛の新規申請 か、買い手宛の逆提案。
      `and(seller_id.eq.${userId},status.eq.申請中),and(buyer_id.eq.${userId},status.eq.日程調整中)`,
    );
  if (error) {
    console.error("fetchActionRequiredCount failed:", error.message);
    return 0;
  }
  return count ?? 0;
}
