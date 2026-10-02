import mongoose, { Schema, Document, Types } from "mongoose";

export type PointTransactionType =
  | "earn"
  | "consume"
  | "expire"
  | "bonus"
  | "manual_add"
  | "manual_sub";

export interface IPointTransaction extends Document {
  userId: string;
  type: PointTransactionType;
  amount: number;
  reason: string;
  adminId?: Types.ObjectId;
  relatedRuleId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PointTransactionSchema = new Schema<IPointTransaction>(
  {
    userId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["earn", "consume", "expire", "bonus", "manual_add", "manual_sub"],
      required: true,
    },
    amount: { type: Number, required: true },
    reason: { type: String, required: true },
    adminId: { type: Schema.Types.ObjectId, ref: "Admin" },
    relatedRuleId: { type: Schema.Types.ObjectId, ref: "PointRule" },
  },
  { timestamps: true }
);

PointTransactionSchema.index({ userId: 1, createdAt: -1 });
PointTransactionSchema.index({ type: 1 });

export default mongoose.models.PointTransaction ??
  mongoose.model<IPointTransaction>("PointTransaction", PointTransactionSchema);
