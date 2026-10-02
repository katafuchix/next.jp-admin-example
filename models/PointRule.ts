import mongoose, { Schema, Document } from "mongoose";

export type PointRuleType = "earn" | "consume" | "expire" | "bonus";

export interface IPointRule extends Document {
  name: string;
  description?: string;
  type: PointRuleType;
  points: number;
  condition?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const PointRuleSchema = new Schema<IPointRule>(
  {
    name: { type: String, required: true },
    description: { type: String },
    type: {
      type: String,
      enum: ["earn", "consume", "expire", "bonus"],
      required: true,
    },
    points: { type: Number, required: true },
    condition: { type: String },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

PointRuleSchema.index({ type: 1, isActive: 1 });
PointRuleSchema.index({ sortOrder: 1 });

export default mongoose.models.PointRule ??
  mongoose.model<IPointRule>("PointRule", PointRuleSchema);
