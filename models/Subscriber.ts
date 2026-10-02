import mongoose, { Schema, Document } from "mongoose";

export interface ISubscriber extends Document {
  email: string;
  name?: string;
  isSubscribed: boolean;
  tags: string[];
  unsubscribeToken: string;
  subscribedAt: Date;
  unsubscribedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriberSchema = new Schema<ISubscriber>(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String },
    isSubscribed: { type: Boolean, default: true },
    tags: { type: [String], default: [] },
    unsubscribeToken: { type: String, required: true },
    subscribedAt: { type: Date, default: Date.now },
    unsubscribedAt: { type: Date },
  },
  { timestamps: true }
);

SubscriberSchema.index({ isSubscribed: 1 });
SubscriberSchema.index({ unsubscribeToken: 1 });

export default mongoose.models.Subscriber ??
  mongoose.model<ISubscriber>("Subscriber", SubscriberSchema);
