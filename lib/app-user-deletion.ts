import mongoose, { type Connection } from "mongoose";

/**
 * アプリ側 DB からユーザーと関連データを削除する。
 * 削除範囲はアプリの退会処理（care/server/routes/user.ts の DELETE /profile）と揃えている。
 * `users` から消えるため、同じメールアドレスでアプリから再登録できる。
 *
 * 関連データを先に消し、ユーザーは最後に消す（途中で失敗してもユーザーが残り、やり直せる）。
 * 戻り値は、ユーザーを削除できたか（既に消えていた場合は false）。
 */
export async function deleteAppUserWithRelatedData(
  conn: Connection,
  userId: string,
): Promise<boolean> {
  const _id = new mongoose.Types.ObjectId(userId);

  const conversationIds = await conn
    .collection("conversations")
    .distinct("_id", { userId: _id });

  await Promise.all([
    conn.collection("healthlogs").deleteMany({ userId: _id }),
    conn.collection("achievements").deleteMany({ userId: _id }),
    conn.collection("dashboardstats").deleteMany({ userId: _id }),
    conn.collection("conversations").deleteMany({ userId: _id }),
    conversationIds.length > 0
      ? conn
          .collection("chatmessages")
          .deleteMany({ conversationId: { $in: conversationIds } })
      : Promise.resolve(),
  ]);

  const { deletedCount } = await conn.collection("users").deleteOne({ _id });
  return deletedCount > 0;
}
