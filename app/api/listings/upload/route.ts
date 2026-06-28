import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 出品画像のアップロード（サーバー経由）。
// このプロジェクトは非対称JWT(ES256)署名キーを使っており、Storage サービスが
// ユーザートークンを検証できず、ブラウザからの直接アップロードが 400 になる。
// そのため画像はここに送り、service role でアップロードする。
// RLS バイパスになるぶん、storage の INSERT ポリシーと同等のガード
//（ログイン必須・在籍有効・自分のフォルダ・形式/サイズ/枚数制限）をここで再現する。
export const runtime = "nodejs";

const BUCKET = "listing-images";
const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB / 1枚
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(req: Request) {
  // 1) 認証（Cookie のセッションから）
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  // 2) 在籍有効チェック（storage RLS の is_enrollment_active(auth.uid()) と同等）
  const { data: active, error: actErr } = await supabase.rpc("is_enrollment_active", {
    uid: user.id,
  });
  if (actErr) {
    return NextResponse.json({ error: actErr.message }, { status: 500 });
  }
  if (!active) {
    return NextResponse.json(
      { error: "在籍確認が有効なユーザーのみ出品できます" },
      { status: 403 },
    );
  }

  // 3) ファイル取り出し & バリデーション
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "画像がありません" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `画像は最大${MAX_FILES}枚までです` },
      { status: 400 },
    );
  }
  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "対応していない画像形式です（JPEG / PNG / WebP / GIF）" },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "画像サイズが大きすぎます（1枚あたり5MBまで）" },
        { status: 400 },
      );
    }
  }

  // 4) service role でアップロード（保存先は本人フォルダ {userId}/...）
  const admin = createAdminClient();
  const urls: string[] = [];
  for (const file of files) {
    const ext = EXT_BY_TYPE[file.type] ?? "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      return NextResponse.json(
        { error: `画像のアップロードに失敗しました: ${error.message}` },
        { status: 500 },
      );
    }
    urls.push(admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }

  return NextResponse.json({ urls });
}
