import { createClient } from "@/lib/supabase/client";
import type { Condition, Listing } from "./types";

// ===================================================
// 出品データアクセス層
// UI はこのモジュール経由で listings を読み書きする（mock-data の継ぎ目を置換）。
// DB カラム ↔ Listing 型の変換もここに集約する。
// ===================================================

// listings + 出品者名（profiles.name）を結合して取得する select 句。
// profiles は PII を別テーブル(profiles_private)へ分離した「公開安全」テーブルなので
// authenticated は他人の行も閲覧でき、出品者名をそのまま結合できる（anon は不可）。
const SELECT = "*, profiles(name)";

type ListingRow = {
  id: string;
  title: string;
  subject: string;
  author: string | null;
  publisher: string | null;
  isbn: string | null;
  publication_year: string | null;
  description: string | null;
  category: string | null;
  condition: string;
  price: number;
  location: string;
  image_urls: string[] | null;
  seller_id: string;
  status: string;
  views: number;
  likes: number;
  created_at: string;
  profiles: { name: string | null } | null;
};

function rowToListing(row: ListingRow): Listing {
  const images = row.image_urls ?? [];
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    author: row.author ?? undefined,
    publisher: row.publisher ?? undefined,
    isbn: row.isbn ?? undefined,
    publication_year: row.publication_year ?? undefined,
    description: row.description ?? undefined,
    category: row.category ?? undefined,
    condition: row.condition as Condition,
    price: row.price,
    location: row.location,
    image_url: images[0],
    image_urls: images,
    seller_id: row.seller_id,
    seller_name: row.profiles?.name ?? "出品者",
    status: row.status as Listing["status"],
    views: row.views,
    likes: row.likes,
    created_at: new Date(row.created_at).getTime(),
  };
}

/** 全出品を新しい順で取得（status のフィルタは呼び出し側に委ねる）。 */
export async function fetchListings(): Promise<Listing[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(SELECT)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchListings failed:", error.message);
    return [];
  }
  return (data as ListingRow[]).map(rowToListing);
}

/**
 * 出品中（在籍有効な出品者）の全学合計件数。LP のカウンタ（PB-005）用。
 * listings は未ログイン(anon)から直接読めないため、件数だけ返す SECURITY DEFINER
 * RPC 経由で取得する（未ログインの LP でも数字を出せる）。
 */
export async function countActiveListings(): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("count_active_listings");
  if (error) {
    console.error("countActiveListings failed:", error.message);
    return 0;
  }
  return (data as number) ?? 0;
}

/**
 * LP の新着プレビュー（PB-005）。未ログインでも表示するため、公開安全な列だけを返す
 * SECURITY DEFINER RPC 経由で取得する。出品中かつ在籍有効な出品者の出品のみ。
 */
export async function fetchNewestListings(limit = 4): Promise<Listing[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_newest_listings", { p_limit: limit });
  if (error) {
    console.error("fetchNewestListings failed:", error.message);
    return [];
  }
  type NewestRow = {
    id: string;
    title: string;
    subject: string;
    price: number;
    image_urls: string[] | null;
    seller_name: string | null;
    created_at: string;
  };
  return (data as NewestRow[]).map((row) => {
    const images = row.image_urls ?? [];
    return {
      id: row.id,
      title: row.title,
      subject: row.subject,
      price: row.price,
      image_url: images[0],
      image_urls: images,
      seller_name: row.seller_name ?? "出品者",
      status: "出品中",
      created_at: new Date(row.created_at).getTime(),
      // 詳細列は LP プレビューでは不要（型の必須項目だけ埋める）
      condition: "" as Condition,
      location: "",
      seller_id: "",
      views: 0,
      likes: 0,
    } satisfies Listing;
  });
}

/**
 * 学部別の出品中件数（PB-005、ログイン後表示用）。
 * 教科書自体に学部属性が無いため、出品者(profiles)の学部で絞り込む。
 */
export async function countActiveListingsByFaculty(faculty: string): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("listings")
    .select("id, profiles!inner(faculty)", { count: "exact", head: true })
    .eq("status", "出品中")
    .eq("profiles.faculty", faculty);
  if (error) {
    console.error("countActiveListingsByFaculty failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * 出品者(profiles)の学部で絞った出品を新しい順で取得（PB-025、ログイン後の一覧用）。
 * 教科書自体に学部属性が無いため、出品者の学部で絞る。
 * excludeSellerId を渡すと、その出品者（＝自分）の出品は一覧から除外する
 *（自分の出品はマイページで確認する想定）。
 */
export async function fetchListingsByFaculty(
  faculty: string,
  excludeSellerId?: string,
): Promise<Listing[]> {
  const supabase = createClient();
  let q = supabase
    .from("listings")
    .select("*, profiles!inner(name, faculty)")
    .eq("profiles.faculty", faculty);
  if (excludeSellerId) q = q.neq("seller_id", excludeSellerId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) {
    console.error("fetchListingsByFaculty failed:", error.message);
    return [];
  }
  return (data as ListingRow[]).map(rowToListing);
}

/** 単一出品を取得。見つからなければ null。 */
export async function fetchListingById(id: string): Promise<Listing | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("fetchListingById failed:", error.message);
    return null;
  }
  return data ? rowToListing(data as ListingRow) : null;
}

/**
 * 画像を Storage にアップロードし、公開URLの配列を返す。
 * サーバー経由（/api/listings/upload）で service role を使ってアップロードする。
 * ※このプロジェクトは非対称JWT(ES256)を使っており、Storage がユーザートークンを
 *   検証できずブラウザ直アップロードが 400 になるため。保存先は本人フォルダ
 *   listing-images/{userId}/{uuid}.{ext}（ユーザー判定はサーバー側のセッション）。
 */
export async function uploadListingImages(files: File[]): Promise<string[]> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const res = await fetch("/api/listings/upload", { method: "POST", body: form });
  const json = (await res.json().catch(() => null)) as { urls?: string[]; error?: string } | null;
  if (!res.ok || !json?.urls) {
    throw new Error(json?.error || "画像のアップロードに失敗しました");
  }
  return json.urls;
}

export type SellerProfile = {
  name: string;
  faculty?: string;
  grade?: string;
  rating: number;
  rating_count: number;
};

/** 出品者プロフィール（詳細ページの出品者カード用）。 */
export async function fetchSellerProfile(id: string): Promise<SellerProfile | null> {
  const supabase = createClient();
  // 出品者プロフィールは公開安全テーブル profiles から直接読む（PII は profiles_private 側）。
  const { data, error } = await supabase
    .from("profiles")
    .select("name, faculty, grade, rating, rating_count")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("fetchSellerProfile failed:", error.message);
    return null;
  }
  return {
    name: data.name ?? "出品者",
    faculty: data.faculty ?? undefined,
    grade: data.grade ?? undefined,
    rating: data.rating ?? 5,
    rating_count: data.rating_count ?? 0,
  };
}

export type CreateListingInput = {
  title: string;
  subject: string;
  author?: string;
  publisher?: string;
  isbn?: string;
  publication_year?: string;
  description?: string;
  condition: Condition;
  price: number;
  location: string;
  image_urls: string[];
};

/** 出品のステータスを更新（PB：完了にする 等）。本人のみ（RLS）。 */
export async function updateListingStatus(
  id: string,
  status: Listing["status"],
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("listings").update({ status }).eq("id", id);
  if (error) {
    console.error("updateListingStatus failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

/** 出品を削除。本人のみ（RLS）。関連する予約は ON DELETE CASCADE で消える。 */
export async function deleteListing(id: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("listings").delete().eq("id", id);
  if (error) {
    console.error("deleteListing failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

/** 既存出品を更新（編集）。本人のみ（RLS）。status / views 等は変更しない。 */
export async function updateListing(
  id: string,
  input: CreateListingInput,
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("listings")
    .update({
      title: input.title,
      subject: input.subject,
      author: input.author || null,
      publisher: input.publisher || null,
      isbn: input.isbn || null,
      publication_year: input.publication_year || null,
      description: input.description || null,
      condition: input.condition,
      price: input.price,
      location: input.location,
      image_urls: input.image_urls,
    })
    .eq("id", id);
  if (error) {
    console.error("updateListing failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

/** 出品を新規作成。成功時は作成された id を返す。 */
export async function createListing(
  input: CreateListingInput,
  sellerId: string,
): Promise<{ id?: string; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("listings")
    .insert({
      title: input.title,
      subject: input.subject,
      author: input.author || null,
      publisher: input.publisher || null,
      isbn: input.isbn || null,
      publication_year: input.publication_year || null,
      description: input.description || null,
      category: "教科書",
      condition: input.condition,
      price: input.price,
      location: input.location,
      image_urls: input.image_urls,
      seller_id: sellerId,
    })
    .select("id")
    .single();
  if (error) {
    console.error("createListing failed:", error.message);
    return { error: error.message };
  }
  return { id: data.id as string, error: null };
}
