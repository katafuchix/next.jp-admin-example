import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";

function getApp() {
  if (getApps().length > 0) return getApps()[0]!;

  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!encoded) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not set");
  }

  let serviceAccount: object;
  try {
    serviceAccount = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf-8"),
    );
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is not valid Base64-encoded JSON",
    );
  }

  return initializeApp({ credential: cert(serviceAccount) });
}

export function getFirebaseMessaging(): Messaging {
  return getMessaging(getApp());
}

/**
 * Firebase Storage のバケットを取得する。
 * FIREBASE_STORAGE_BUCKET は `gs://<bucket>` 形式でも `<bucket>` 単体でも受け付ける。
 */
export function getFirebaseStorageBucket() {
  const raw = process.env.FIREBASE_STORAGE_BUCKET;
  if (!raw) {
    throw new Error("FIREBASE_STORAGE_BUCKET is not set");
  }
  const bucketName = raw.replace(/^gs:\/\//, "");
  return getStorage(getApp()).bucket(bucketName);
}
