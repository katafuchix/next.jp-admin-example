import mongoose, { Schema, type Model } from "mongoose";
import { AD_SOURCE_IDS } from "@/lib/ad-sources/types";
import type { AdSyncRunRecord } from "@/lib/ad-sync";

/** 媒体ごとの同期の履歴（管理画面DB）。成功・失敗・スキップを1回1行で残す */
export type IAdSyncRun = AdSyncRunRecord & { createdAt: Date };

const AdSyncRunSchema = new Schema<IAdSyncRun>(
  {
    source: { type: String, enum: AD_SOURCE_IDS, required: true },
    trigger: { type: String, enum: ["cron", "manual", "csv"], required: true },
    status: {
      type: String,
      enum: ["success", "failed", "skipped"],
      required: true,
    },
    from: { type: String, required: true },
    to: { type: String, required: true },
    rowCount: { type: Number, default: 0 },
    message: { type: String, default: null },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AdSyncRunSchema.index({ source: 1, startedAt: -1 });
AdSyncRunSchema.index({ status: 1, source: 1, startedAt: -1 });

export const AdSyncRun =
  (mongoose.models.AdSyncRun as Model<IAdSyncRun> | undefined) ??
  mongoose.model<IAdSyncRun>("AdSyncRun", AdSyncRunSchema);
