import mongoose, { Schema, Document } from "mongoose";

export type NotificationTargetSegment = "all" | "active" | "inactive" | "premium";
export type NotificationStatus = "draft" | "scheduled" | "sent" | "failed";
export type NotificationScheduleType = "immediate" | "once" | "recurring";

export interface INotificationRecurrence {
  daysOfWeek: number[]; // 0=日 〜 6=土
  time: string; // "HH:mm"
}

export interface INotification extends Document {
  title: string;
  body: string;
  targetSegment: NotificationTargetSegment;
  status: NotificationStatus;
  scheduleType: NotificationScheduleType;
  enabled: boolean;
  recurrence?: INotificationRecurrence;
  cronExpression?: string;
  schedulerJobName?: string;
  lastDispatchedAt?: Date;
  scheduledAt?: Date;
  sentAt?: Date;
  totalTargets: number;
  delivered: number;
  opened: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    targetSegment: {
      type: String,
      enum: ["all", "active", "inactive", "premium"],
      default: "all",
    },
    status: {
      type: String,
      enum: ["draft", "scheduled", "sent", "failed"],
      default: "draft",
    },
    scheduleType: {
      type: String,
      enum: ["immediate", "once", "recurring"],
      default: "immediate",
    },
    enabled: { type: Boolean, default: true },
    recurrence: {
      daysOfWeek: { type: [Number], default: undefined },
      time: { type: String, default: undefined },
    },
    cronExpression: { type: String },
    schedulerJobName: { type: String },
    lastDispatchedAt: { type: Date },
    scheduledAt: { type: Date },
    sentAt: { type: Date },
    totalTargets: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: "Admin" },
  },
  { timestamps: true }
);

NotificationSchema.index({ status: 1, scheduledAt: 1 });
NotificationSchema.index({ createdAt: -1 });

export default mongoose.models.Notification ??
  mongoose.model<INotification>("Notification", NotificationSchema);
