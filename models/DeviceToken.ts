import mongoose, { Schema, Document } from "mongoose";

export type DevicePlatform = "ios" | "android" | "web";
export type DeviceSegment = "all" | "active" | "inactive" | "premium";

export interface IDeviceToken extends Document {
  userId: string;
  token: string;
  platform: DevicePlatform;
  segment: DeviceSegment;
  isActive: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceTokenSchema = new Schema<IDeviceToken>(
  {
    userId: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    platform: {
      type: String,
      enum: ["ios", "android", "web"],
      required: true,
    },
    segment: {
      type: String,
      enum: ["all", "active", "inactive", "premium"],
      default: "all",
    },
    isActive: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

DeviceTokenSchema.index({ userId: 1 });
DeviceTokenSchema.index({ segment: 1, isActive: 1 });

export default mongoose.models.DeviceToken ??
  mongoose.model<IDeviceToken>("DeviceToken", DeviceTokenSchema);
