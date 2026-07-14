export type ListingStatus = "出品中" | "予約済み" | "完了";

export type Condition =
  | "新品・未使用"
  | "書き込みなし"
  | "書き込み少し"
  | "汚れ・ダメージあり";

export type ReservationStatus =
  | "申請中"
  | "日程調整中"
  | "承認済み"
  | "完了"
  | "キャンセル";

export interface User {
  id: string;
  name: string;
  /** ログイン用メール（登録時は大学メール。卒業時に個人メールへ切替可） */
  email: string;
  /** 在籍確認に使った大学メール（再認証メールの宛先。切替後も残す） */
  university_email?: string;
  /** 復旧用アドレス（卒業後も使える連絡先。ロックアウト時の救済先） */
  recovery_email?: string;
  /** 在籍確認の有効期限（ISO文字列）。これを過ぎると出品・購入が停止する。 */
  enrollment_valid_until?: string | null;
  university: string;
  faculty: string;
  grade: string;
  gender?: string;
  rating: number;
  rating_count: number;
}

export interface Listing {
  id: string;
  title: string;
  subject: string;
  author?: string;
  publisher?: string;
  isbn?: string;
  publication_year?: string;
  description?: string;
  /** カテゴリ。現状は「教科書」固定（PB-017）。 */
  category?: string;
  condition: Condition;
  price: number;
  location: string;
  /** メイン画像（= image_urls[0]）。一覧カード等の互換用。 */
  image_url?: string;
  /** Storage 上の全画像URL（先頭がメイン）。 */
  image_urls?: string[];
  seller_id: string;
  seller_name: string;
  status: ListingStatus;
  views: number;
  likes: number;
  created_at: number;
  /** この出品が一覧/検索に表示される学部の集合（PB-058 学部横断出品）。既定は出品者の学部。 */
  faculties?: string[];
}

/** 買い手が提示する受け渡し候補（日付＋時刻のセット）。機能④。 */
export interface CandidateSlot {
  date: string;
  time: string;
}

export interface Reservation {
  id: string;
  listing_id: string;
  listing_title: string;
  buyer_id: string;
  buyer_name: string;
  seller_id: string;
  seller_name: string;
  price: number;
  preferred_date: string;
  preferred_time: string;
  preferred_location: string;
  /** 買い手が提示した受け渡し候補（機能④）。1〜3件。旧データは undefined。 */
  candidate_slots?: CandidateSlot[];
  /** 出品者が確定した候補の index（機能④）。未選択時は undefined。 */
  selected_slot?: number;
  /** 出品者が提案した代替日程（機能③）。未提案時は undefined。 */
  proposed_date?: string;
  proposed_time?: string;
  proposed_location?: string;
  message?: string;
  status: ReservationStatus;
  created_at: number;
  /** 決済（PB-036）。PAY.jp Charge ID。未決済は undefined。 */
  charge_id?: string;
  /** 決済完了時刻（ミリ秒）。未決済は undefined。 */
  paid_at?: number;
}

/** 取引メッセージ（PB-041）。1 予約（reservation）= 1 スレッド。 */
export interface Message {
  id: string;
  reservation_id: string;
  sender_id: string;
  body: string;
  created_at: number;
}
