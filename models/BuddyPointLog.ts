import { Schema, Types, type Connection, type Model } from "mongoose";

/**
 * care側 `buddypointlogs` コレクション（care/server/models/BuddyPointLog.ts）の読み取り専用ミラー。
 * ユーザーのポイント獲得・消費の実ログ（health_log/streak/achievement/login_bonus/gacha等）。
 */
export interface IBuddyPointLog {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  amount: number;
  type: "earn" | "spend";
  source: string;
  description?: string;
  balanceAfter: number;
  createdAt: Date;
}

const BuddyPointLogSchema = new Schema<IBuddyPointLog>({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  amount: { type: Number },
  type: { type: String, enum: ["earn", "spend"] },
  source: { type: String },
  description: { type: String },
  balanceAfter: { type: Number },
});

export function getBuddyPointLogModel(conn: Connection): Model<IBuddyPointLog> {
  return (
    (conn.models.BuddyPointLog as Model<IBuddyPointLog> | undefined) ??
    conn.model<IBuddyPointLog>("BuddyPointLog", BuddyPointLogSchema)
  );
}
