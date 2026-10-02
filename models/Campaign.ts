import { Schema, type Connection, type Model } from "mongoose";

/**
 * アプリ側 `campaigns` コレクション（care/server 側のキャンペーンデータ）。
 * CommonCalorieItem と同様、管理画面から作成・更新・削除も行う。
 * imageUrl は Firebase Storage にアップロードした画像の公開URL（lib/storage.ts 経由）。
 */
export type CampaignStatus = "draft" | "published" | "ended";

export interface ICampaign {
  _id: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  startAt: Date;
  endAt: Date;
  status: CampaignStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

const CampaignSchema = new Schema<ICampaign>(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    imageUrl: { type: String, default: null },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["draft", "published", "ended"],
      default: "draft",
      required: true,
    },
  },
  { timestamps: true, collection: "campaigns" },
);

CampaignSchema.index({ status: 1 });
CampaignSchema.index({ startAt: 1, endAt: 1 });

export function getCampaignModel(conn: Connection): Model<ICampaign> {
  return (
    (conn.models.Campaign as Model<ICampaign> | undefined) ??
    conn.model<ICampaign>("Campaign", CampaignSchema)
  );
}
