import mongoose, { Schema, type Connection, type Model } from "mongoose";

/**
 * アプリ側 `healthlogs` コレクション（care/server/models/HealthLog.ts）の読み取り専用ミラー。
 * 必要なフィールドのみ定義し、書き込みは行わない。
 */
export interface IHealthLog {
  _id: string;
  userId: mongoose.Types.ObjectId;
  type: string;
  data: Record<string, unknown>;
  date: Date;
}

const HealthLogSchema = new Schema<IHealthLog>({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  type: { type: String },
  data: { type: Schema.Types.Mixed },
  date: { type: Date },
});

export function getHealthLogModel(conn: Connection): Model<IHealthLog> {
  return (
    (conn.models.HealthLog as Model<IHealthLog> | undefined) ??
    conn.model<IHealthLog>("HealthLog", HealthLogSchema)
  );
}
