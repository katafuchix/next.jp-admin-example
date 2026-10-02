import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireRole, WRITE_ROLES } from "@/lib/authz";
import { uploadImage, MAX_IMAGE_BYTES, ALLOWED_IMAGE_TYPES } from "@/lib/storage";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const forbidden = requireRole(session, WRITE_ROLES);
  if (forbidden) return forbidden;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "画像ファイルが指定されていません" },
        { status: 400 },
      );
    }
    if (!(file.type in ALLOWED_IMAGE_TYPES)) {
      return NextResponse.json(
        {
          success: false,
          error: "対応していない画像形式です（jpg, png, webp, gifのみ）",
        },
        { status: 400 },
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { success: false, error: "画像サイズは5MB以下にしてください" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadImage(buffer, file.type, "campaigns");

    return NextResponse.json({ success: true, data: { url } });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "アップロードに失敗しました";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
