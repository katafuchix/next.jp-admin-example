import mongoose, { Schema, type Model } from "mongoose";

/**
 * 課金率の日次記録（管理画面DB）。JST の1日につき1行。
 * アプリの users.isPaid は今の状態しか持たないので、課金率の推移はこの記録を始めた日からしか出せない。
 */
export interface IPaidRateSnapshot {
  /** JST の日付 YYYY-MM-DD */
  date: string;
  /** 課金中のユーザー数 */
  paid: number;
  /** 総ユーザー数 */
  total: number;
  /** この値を数えた時刻（同じ日に何度か記録したら最後の時刻） */
  recordedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaidRateSnapshotSchema = new Schema<IPaidRateSnapshot>(
  {
    date: { type: String, required: true },
    paid: { type: Number, required: true },
    total: { type: Number, required: true },
    recordedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

PaidRateSnapshotSchema.index({ date: 1 }, { unique: true });

export const PaidRateSnapshot =
  (mongoose.models.PaidRateSnapshot as Model<IPaidRateSnapshot> | undefined) ??
  mongoose.model<IPaidRateSnapshot>("PaidRateSnapshot", PaidRateSnapshotSchema);
