import { randomUUID } from "crypto";
import { getFirebaseStorageBucket } from "@/lib/firebase-admin";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * 画像を Firebase Storage にアップロードし、恒久的にアクセス可能なダウンロードURLを返す。
 *
 * 均一なバケットレベルアクセス（UBLA）が有効なバケットではオブジェクト単位のACL
 * （file.save({ public: true }) 等）が使えないため、Firebase公式クライアントSDKと
 * 同じ「ダウンロードトークン」方式を採用する。Storage Security Rules の設定に依存せず、
 * バケットのIAM設定も変更不要で、常に安定して動作する。
 */
export async function uploadImage(
  buffer: Buffer,
  contentType: string,
  folder: string,
): Promise<string> {
  const ext = ALLOWED_IMAGE_TYPES[contentType];
  if (!ext) {
    throw new Error("対応していない画像形式です");
  }

  const bucket = getFirebaseStorageBucket();
  const path = `${folder}/${randomUUID()}.${ext}`;
  const token = randomUUID();
  const file = bucket.file(path);

  await file.save(buffer, {
    metadata: {
      contentType,
      cacheControl: "public, max-age=31536000",
      metadata: { firebaseStorageDownloadTokens: token },
    },
    resumable: false,
  });

  return buildDownloadUrl(bucket.name, path, token);
}

function buildDownloadUrl(
  bucketName: string,
  path: string,
  token: string,
): string {
  const encodedPath = encodeURIComponent(path);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
}

/**
 * uploadImage() が発行したダウンロードURLから対応するオブジェクトを削除する。
 * 自バケット以外のURLやエラーは無視する（ベストエフォート）。
 */
export async function deleteImageByPublicUrl(url: string): Promise<void> {
  try {
    const bucket = getFirebaseStorageBucket();
    const prefix = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/`;
    if (!url.startsWith(prefix)) return;
    const encodedPath = url.slice(prefix.length).split("?")[0];
    const path = decodeURIComponent(encodedPath);
    await bucket.file(path).delete({ ignoreNotFound: true });
  } catch {
    // 削除失敗は無視する
  }
}
