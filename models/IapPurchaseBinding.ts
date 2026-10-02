import { Schema, Types, type Connection, type Model } from "mongoose";

/**
 * care側 `iappurchasebindings` コレクション（care/server/models/IapPurchaseBinding.ts）の読み取り専用ミラー。
 * ストアの購入識別子とユーザーの紐づけ（実際の課金イベント）。
 */
export interface IIapPurchaseBinding {
  _id: Types.ObjectId;
  platform: "ios" | "android";
  purchaseKey: string;
  ownerUserId: Types.ObjectId;
  productId?: string;
  createdAt: Date;
}

const IapPurchaseBindingSchema = new Schema<IIapPurchaseBinding>({
  platform: { type: String, enum: ["ios", "android"] },
  purchaseKey: { type: String },
  ownerUserId: { type: Schema.Types.ObjectId, ref: "User" },
  productId: { type: String },
});

export function getIapPurchaseBindingModel(
  conn: Connection,
): Model<IIapPurchaseBinding> {
  return (
    (conn.models.IapPurchaseBinding as
      | Model<IIapPurchaseBinding>
      | undefined) ??
    conn.model<IIapPurchaseBinding>(
      "IapPurchaseBinding",
      IapPurchaseBindingSchema,
    )
  );
}
