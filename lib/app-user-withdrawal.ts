import type { Connection } from "mongoose";
import {
  getAppUserWithdrawalModel,
  type IAppUserWithdrawal,
} from "@/models/AppUserWithdrawal";

export interface AppUserWithdrawalRecord {
  userId: string;
  withdrawnAt: Date;
  signedUpAt: Date | null;
  wasPaid: boolean;
  source: IAppUserWithdrawal["source"];
}

/**
 * 退会を1件記録する。ユーザーを消す前に呼ぶ。
 * userId で1行なので、削除をやり直しても二重に数えず、最初の記録が残る。
 */
export async function recordAppUserWithdrawal(
  conn: Connection,
  { userId, ...fields }: AppUserWithdrawalRecord,
): Promise<void> {
  await getAppUserWithdrawalModel(conn).updateOne(
    { userId },
    { $setOnInsert: fields },
    { upsert: true },
  );
}
