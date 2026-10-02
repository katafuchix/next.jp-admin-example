import { Schema, Types, type Connection, type Model } from "mongoose";

/**
 * 退会の記録（アプリ側 DB の `userwithdrawals`）。1ユーザー1行（userId で一意）。
 * `users` から消すと登録日も課金状態も残らないので、消す直前にここへ写す。
 * 書くのは管理画面の顧客削除（source "admin"）と、アプリの退会処理
 * （care/server/routes/user.ts の DELETE /profile、source "app"）。
 * 退会数はこの記録を始めた日からしか数えられない。
 */
export interface IAppUserWithdrawal {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  withdrawnAt: Date;
  /** 登録日時（createdAt の無い古いユーザーは null） */
  signedUpAt: Date | null;
  /** 退会した時点で課金中だったか */
  wasPaid: boolean;
  source: "app" | "admin";
}

const AppUserWithdrawalSchema = new Schema<IAppUserWithdrawal>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    withdrawnAt: { type: Date, required: true },
    signedUpAt: { type: Date, default: null },
    wasPaid: { type: Boolean, required: true },
    source: { type: String, enum: ["app", "admin"], required: true },
  },
  { collection: "userwithdrawals" },
);

AppUserWithdrawalSchema.index({ userId: 1 }, { unique: true });
AppUserWithdrawalSchema.index({ withdrawnAt: 1 });

export function getAppUserWithdrawalModel(
  conn: Connection,
): Model<IAppUserWithdrawal> {
  return (
    (conn.models.AppUserWithdrawal as Model<IAppUserWithdrawal> | undefined) ??
    conn.model<IAppUserWithdrawal>("AppUserWithdrawal", AppUserWithdrawalSchema)
  );
}
