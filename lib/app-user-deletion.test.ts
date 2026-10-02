import mongoose, { type Connection } from "mongoose";
import { describe, expect, it } from "vitest";
import { deleteAppUserWithRelatedData } from "./app-user-deletion";

const USER_ID = "64b7f0c2a1b2c3d4e5f60001";

type Call = { name: string; op: string; args: unknown[] };

/** 呼ばれたコレクション操作を順に記録する偽の DB 接続 */
function fakeConnection({
  conversationIds = [],
  deletedCount = 1,
  failOn,
}: {
  conversationIds?: unknown[];
  deletedCount?: number;
  failOn?: string;
} = {}) {
  const calls: Call[] = [];
  const record = (
    name: string,
    op: string,
    args: unknown[],
    result: unknown,
  ) => {
    calls.push({ name, op, args });
    if (failOn === `${name}.${op}`)
      return Promise.reject(new Error("db error"));
    return Promise.resolve(result);
  };
  const conn = {
    collection: (name: string) => ({
      distinct: (...args: unknown[]) =>
        record(name, "distinct", args, conversationIds),
      deleteMany: (...args: unknown[]) =>
        record(name, "deleteMany", args, { deletedCount: 0 }),
      deleteOne: (...args: unknown[]) =>
        record(name, "deleteOne", args, { deletedCount }),
    }),
  };
  return { calls, conn: conn as unknown as Connection };
}

function expectObjectIdOf(value: unknown, id: string) {
  expect(value).toBeInstanceOf(mongoose.Types.ObjectId);
  expect(String(value)).toBe(id);
}

describe("deleteAppUserWithRelatedData", () => {
  it("関連データを ObjectId の userId で消し、ユーザーを最後に消して true を返す", async () => {
    const conversationId = new mongoose.Types.ObjectId();
    const { calls, conn } = fakeConnection({
      conversationIds: [conversationId],
    });

    const deleted = await deleteAppUserWithRelatedData(conn, USER_ID);

    expect(deleted).toBe(true);
    for (const name of [
      "healthlogs",
      "achievements",
      "dashboardstats",
      "conversations",
    ]) {
      const call = calls.find((c) => c.name === name && c.op === "deleteMany");
      expect(call, `${name} が削除されていない`).toBeDefined();
      expectObjectIdOf((call?.args[0] as { userId: unknown }).userId, USER_ID);
    }

    const distinct = calls.find(
      (c) => c.name === "conversations" && c.op === "distinct",
    );
    expect(distinct?.args[0]).toBe("_id");
    expectObjectIdOf(
      (distinct?.args[1] as { userId: unknown }).userId,
      USER_ID,
    );

    const chat = calls.find((c) => c.name === "chatmessages");
    expect(chat?.args[0]).toEqual({
      conversationId: { $in: [conversationId] },
    });

    const last = calls.at(-1);
    expect(last?.name).toBe("users");
    expect(last?.op).toBe("deleteOne");
    expectObjectIdOf((last?.args[0] as { _id: unknown })._id, USER_ID);
  });

  it("会話が無ければ chatmessages には触らない", async () => {
    const { calls, conn } = fakeConnection({ conversationIds: [] });

    await deleteAppUserWithRelatedData(conn, USER_ID);

    expect(calls.some((c) => c.name === "chatmessages")).toBe(false);
  });

  it("ユーザーが既に消えていたら false を返す", async () => {
    const { conn } = fakeConnection({ deletedCount: 0 });

    await expect(deleteAppUserWithRelatedData(conn, USER_ID)).resolves.toBe(
      false,
    );
  });

  it("関連データの削除に失敗したら、ユーザーは消さずにエラーを投げる", async () => {
    const { calls, conn } = fakeConnection({ failOn: "healthlogs.deleteMany" });

    await expect(deleteAppUserWithRelatedData(conn, USER_ID)).rejects.toThrow(
      "db error",
    );
    expect(calls.some((c) => c.name === "users")).toBe(false);
  });
});
