import { Schema, Types, type Connection, type Model } from "mongoose";

/**
 * care側 `dashboardstats` コレクション（care/server/models/DashboardStats.ts）の読み取り専用ミラー。
 * アプリのホーム画面表示とチャット送信のたびに「ユーザー × JST の日」で1行 upsert される
 * （一意キー userId + date、date は JST 0 時）。行がある日 = その日にアプリを使った日として扱う。
 */
export interface IDashboardStats {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  date: Date;
}

const DashboardStatsSchema = new Schema<IDashboardStats>({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  date: { type: Date },
});

export function getDashboardStatsModel(
  conn: Connection,
): Model<IDashboardStats> {
  return (
    (conn.models.DashboardStats as Model<IDashboardStats> | undefined) ??
    conn.model<IDashboardStats>("DashboardStats", DashboardStatsSchema)
  );
}
