import mongoose, { Schema, Document } from "mongoose";

export type InquiryCategory = "billing" | "technical" | "account" | "other";
export type InquiryPriority = "low" | "medium" | "high" | "urgent";
export type InquiryStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";

export interface IInquiryReply {
  adminId: mongoose.Types.ObjectId;
  body: string;
  createdAt: Date;
}

export interface IInquiry extends Document {
  ticketId: string;
  userId?: string;
  userEmail?: string;
  subject: string;
  body: string;
  category: InquiryCategory;
  priority: InquiryPriority;
  status: InquiryStatus;
  assigneeId?: mongoose.Types.ObjectId;
  replies: IInquiryReply[];
  createdAt: Date;
  updatedAt: Date;
}

const InquiryReplySchema = new Schema<IInquiryReply>(
  {
    adminId: { type: Schema.Types.ObjectId, required: true, ref: "Admin" },
    body: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const InquirySchema = new Schema<IInquiry>(
  {
    ticketId: { type: String, required: true, unique: true },
    userId: { type: String },
    userEmail: { type: String },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    category: {
      type: String,
      enum: ["billing", "technical", "account", "other"],
      default: "other",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "waiting", "resolved", "closed"],
      default: "open",
    },
    assigneeId: { type: Schema.Types.ObjectId, ref: "Admin" },
    replies: { type: [InquiryReplySchema], default: [] },
  },
  { timestamps: true }
);

InquirySchema.index({ status: 1, priority: -1, createdAt: -1 });
InquirySchema.index({ assigneeId: 1, status: 1 });

export default mongoose.models.Inquiry ??
  mongoose.model<IInquiry>("Inquiry", InquirySchema);
