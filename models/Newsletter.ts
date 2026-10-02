import mongoose, { Schema, Document } from "mongoose";

export type NewsletterStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";

export interface INewsletter extends Document {
  title: string;
  subject: string;
  body: string;
  status: NewsletterStatus;
  scheduledAt?: Date;
  sentAt?: Date;
  totalRecipients: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const NewsletterSchema = new Schema<INewsletter>(
  {
    title: { type: String, required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    status: {
      type: String,
      enum: ["draft", "scheduled", "sending", "sent", "failed"],
      default: "draft",
    },
    scheduledAt: { type: Date },
    sentAt: { type: Date },
    totalRecipients: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    opened: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    unsubscribed: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: "Admin" },
  },
  { timestamps: true }
);

NewsletterSchema.index({ status: 1, scheduledAt: 1 });
NewsletterSchema.index({ createdAt: -1 });

export default mongoose.models.Newsletter ??
  mongoose.model<INewsletter>("Newsletter", NewsletterSchema);
