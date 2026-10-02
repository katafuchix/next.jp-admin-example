import mongoose, { Schema, type Model, type SchemaDefinition } from "mongoose";
import {
  AD_METRIC_KEYS,
  AD_SOURCE_IDS,
  type AdMetrics,
  type AdSourceId,
} from "@/lib/ad-sources/types";

/**
 * 広告・売上の媒体から取り込んだ日次データ（管理画面DB）。
 * 媒体 × JST の日 × キー（キャンペーン・広告枠・商品など）で1行。同期のたびに上書きする。
 */
export interface IAdDailyStat extends AdMetrics {
  source: AdSourceId;
  /** 日付 YYYY-MM-DD。原則 JST だが、App Store は米国太平洋時間・Tenjin は UTC の区切りのまま入る */
  date: string;
  key: string;
  label: string;
  /** この行を書いた同期の開始時刻。取得結果から消えた古い行の判定に使う */
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const metricFields = Object.fromEntries(
  AD_METRIC_KEYS.map((key) => [key, { type: Number, default: 0 }]),
);

const AdDailyStatSchema = new Schema<IAdDailyStat>(
  {
    source: { type: String, enum: AD_SOURCE_IDS, required: true },
    date: { type: String, required: true },
    key: { type: String, required: true },
    label: { type: String, default: "" },
    ...metricFields,
    fetchedAt: { type: Date, required: true },
  } as SchemaDefinition<IAdDailyStat>,
  { timestamps: true },
);

AdDailyStatSchema.index({ source: 1, date: 1, key: 1 }, { unique: true });
AdDailyStatSchema.index({ date: 1 });

export const AdDailyStat =
  (mongoose.models.AdDailyStat as Model<IAdDailyStat> | undefined) ??
  mongoose.model<IAdDailyStat>("AdDailyStat", AdDailyStatSchema);
