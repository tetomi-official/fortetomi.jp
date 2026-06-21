import { createClient } from "@/lib/supabase/client";
import type { Condition, Listing } from "./types";

// ===================================================
// 出品データアクセス層
// UI はこのモジュール経由で listings を読み書きする（mock-data の継ぎ目を置換）。
// DB カラム ↔ Listing 型の変換もここに集約する。
// ===================================================

const BUCKET = "listing-images";

// listings + 出品者名（profiles.name）を結合して取得する select 句。
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

/** 出品中（status='出品中'）の全学合計件数。LP のカウンタ（PB-005）用。 */
export async function countActiveListings(): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "出品中");
  if (error) {
    console.error("countActiveListings failed:", error.message);
    return 0;
  }
  return count ?? 0;
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
 * 保存先: listing-images/{userId}/{uuid}.{ext}
 */
export async function uploadListingImages(
  files: File[],
  userId: string,
): Promise<string[]> {
  const supabase = createClient();
  const urls: string[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      throw new Error(`画像のアップロードに失敗しました: ${error.message}`);
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
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
