import mongoose, { Schema, Document } from "mongoose";

export type AdminRole = "SUPER_ADMIN" | "OPERATOR" | "ANALYST" | "SUPPORT";

export interface IAdmin extends Document {
  email: string;
  passwordHash: string;
  name: string;
  role: AdminRole;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  isActive: boolean;
  loginFailCount: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AdminSchema = new Schema<IAdmin>(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "OPERATOR", "ANALYST", "SUPPORT"],
      required: true,
    },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    isActive: { type: Boolean, default: true },
    loginFailCount: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

export const Admin =
  mongoose.models.Admin ?? mongoose.model<IAdmin>("Admin", AdminSchema);
