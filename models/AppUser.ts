import { Schema, type Connection, type Model } from "mongoose";

/**
 * アプリ側 `users` コレクション（care/server/models/User.ts）のミラー。
 * 必要なフィールドのみ定義する。書き込みは顧客詳細画面からのポイント手動変更と
 * 顧客の削除（`lib/app-user-deletion.ts`）に限る。
 * 居住地は app 側では `prefecture` フィールド名で保存されている（未設定のレコードもある）。
 */
export interface IAppUser {
  _id: string;
  email: string;
  displayName?: string;
  isPaid?: boolean;
  isEmailVerified?: boolean;
  buddyPoints?: number;
  createdAt?: Date;
  lastAppOpenAt?: Date | null;
  age?: number;
  gender?: string;
  height?: number;
  prefecture?: string;
  isOnline?: boolean;
  lastSocketAt?: Date | null;
}

const AppUserSchema = new Schema<IAppUser>({
  email: { type: String },
  displayName: { type: String },
  isPaid: { type: Boolean },
  isEmailVerified: { type: Boolean },
  buddyPoints: { type: Number },
  createdAt: { type: Date },
  lastAppOpenAt: { type: Date },
  age: { type: Number },
  gender: { type: String },
  height: { type: Number },
  prefecture: { type: String },
  isOnline: { type: Boolean },
  lastSocketAt: { type: Date },
});

export function getAppUserModel(conn: Connection): Model<IAppUser> {
  return (
    (conn.models.User as Model<IAppUser> | undefined) ??
    conn.model<IAppUser>("User", AppUserSchema)
  );
}
