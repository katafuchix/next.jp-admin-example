import mongoose, { Schema, Document } from "mongoose";

export interface ILPPage extends Document {
  name: string;
  slug: string;
  url?: string;
  gaPropertyId?: string;
  isActive: boolean;
  sessions: number;
  conversions: number;
  revenue: number;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LPPageSchema = new Schema<ILPPage>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    url: { type: String },
    gaPropertyId: { type: String },
    isActive: { type: Boolean, default: true },
    sessions: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true },
);

LPPageSchema.index({ isActive: 1 });

export default mongoose.models.LPPage ??
  mongoose.model<ILPPage>("LPPage", LPPageSchema);
