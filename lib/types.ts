export type ListingStatus = "出品中" | "予約済み" | "完了";

export type Condition =
  | "新品・未使用"
  | "書き込みなし"
  | "書き込み少し"
  | "汚れ・ダメージあり";

export type ReservationStatus = "申請中" | "承認済み" | "完了" | "キャンセル";

export interface User {
  id: string;
  name: string;
  /** ログイン用メール（登録完了後は個人メール） */
  email: string;
  /** 在籍確認に使った大学メール（監査用の記録） */
  university_email?: string;
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
  message?: string;
  status: ReservationStatus;
  created_at: number;
}
