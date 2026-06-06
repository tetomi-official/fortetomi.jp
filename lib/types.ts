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
  email: string;
  university: string;
  faculty: string;
  grade: string;
  rating: number;
  rating_count: number;
}

export interface Listing {
  id: string;
  title: string;
  subject: string;
  author?: string;
  isbn?: string;
  publication_year?: string;
  description?: string;
  condition: Condition;
  price: number;
  location: string;
  image_url?: string;
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
