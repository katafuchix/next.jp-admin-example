import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Connection } from "mongoose";
import { fetchAppPointStats, RECENT_LIMIT } from "./query";

const mocks = vi.hoisted(() => ({
  logAggregate: vi.fn(),
  logFind: vi.fn(),
  userAggregate: vi.fn(),
  userFind: vi.fn(),
}));

/** Mongoose のクエリ（.sort().limit().lean()）の代わり */
function query<T>(result: T) {
  const q = {
    sort: vi.fn(() => q),
    limit: vi.fn(() => q),
    lean: () => Promise.resolve(result),
  };
  return q;
}

vi.mock("@/models/BuddyPointLog", () => ({
  getBuddyPointLogModel: () => ({
    aggregate: mocks.logAggregate,
    find: mocks.logFind,
  }),
}));
vi.mock("@/models/AppUser", () => ({
  getAppUserModel: () => ({
    aggregate: mocks.userAggregate,
    find: mocks.userFind,
  }),
}));

const CONN = {} as Connection;
const RANGE = { from: "2026-09-01", to: "2026-09-03" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.logAggregate.mockResolvedValue([
    {
      bySource: [
        {
          _id: { type: "spend", source: "gacha" },
          count: 2,
          points: 200,
          users: 1,
        },
        {
          _id: { type: "earn", source: "meal" },
          count: 3,
          points: 9,
          users: 2,
        },
        {
          _id: { type: "earn", source: "login_bonus" },
          count: 10,
          points: 30,
          users: 5,
        },
        {
          _id: { type: "earn", source: "new_campaign" },
          count: 1,
          points: 50,
          users: 1,
        },
      ],
      users: [{ n: 6 }],
    },
  ]);
  mocks.userAggregate.mockResolvedValue([{ total: 12345, holders: 321 }]);
  mocks.logFind.mockReturnValue(
    query([
      {
        _id: "log2",
        userId: "u1",
        amount: -100,
        type: "spend",
        source: "gacha",
        balanceAfter: 20,
        createdAt: new Date("2026-09-03T05:00:00Z"),
      },
      {
        _id: "log1",
        userId: "u9",
        amount: 3,
        type: "earn",
        source: "meal",
        balanceAfter: 120,
        createdAt: new Date("2026-09-02T05:00:00Z"),
      },
    ]),
  );
  mocks.userFind.mockReturnValue(
    query([{ _id: "u1", displayName: "はなこ", email: "hanako@example.com" }]),
  );
});

describe("fetchAppPointStats", () => {
  it("期間は JST の1日目 0時から、終了日の翌日 0時の手前まで", async () => {
    await fetchAppPointStats(CONN, RANGE);

    const pipeline = mocks.logAggregate.mock.calls[0][0];
    expect(pipeline[0]).toEqual({
      $match: {
        createdAt: {
          $gte: new Date("2026-08-31T15:00:00Z"),
          $lt: new Date("2026-09-03T15:00:00Z"),
        },
      },
    });
    expect(mocks.logFind).toHaveBeenCalledWith({
      createdAt: {
        $gte: new Date("2026-08-31T15:00:00Z"),
        $lt: new Date("2026-09-03T15:00:00Z"),
      },
    });
  });

  it("付与と消費の合計・件数・期間中に動きのあった人数を出す", async () => {
    const stats = await fetchAppPointStats(CONN, RANGE);

    expect(stats.totals).toEqual({
      earned: 89,
      earnCount: 14,
      spent: 200,
      spendCount: 2,
      users: 6,
    });
  });

  it("内訳は付与を先・消費を後にし、それぞれポイントの多い順。表示名を付け、知らない値はそのまま", async () => {
    const stats = await fetchAppPointStats(CONN, RANGE);

    expect(stats.bySource).toEqual([
      {
        type: "earn",
        source: "new_campaign",
        label: "new_campaign",
        count: 1,
        points: 50,
        users: 1,
      },
      {
        type: "earn",
        source: "login_bonus",
        label: "ログインボーナス",
        count: 10,
        points: 30,
        users: 5,
      },
      {
        type: "earn",
        source: "meal",
        label: "食事の記録",
        count: 3,
        points: 9,
        users: 2,
      },
      {
        type: "spend",
        source: "gacha",
        label: "ガチャ",
        count: 2,
        points: 200,
        users: 1,
      },
    ]);
  });

  it("消費はマイナスで記録されていても、正の数で数える", async () => {
    await fetchAppPointStats(CONN, RANGE);

    const group = mocks.logAggregate.mock.calls[0][0][1].$facet.bySource[0];
    expect(group.$group.points).toEqual({ $sum: { $abs: "$amount" } });
  });

  it("全ユーザーの今の残高の合計は、期間に関係なく出す", async () => {
    const stats = await fetchAppPointStats(CONN, RANGE);

    expect(stats.balance).toEqual({ total: 12345, holders: 321 });
  });

  it("直近の記録は新しい順に上限件数まで、名前を付けて返す。見つからない人は「不明」", async () => {
    const stats = await fetchAppPointStats(CONN, RANGE);

    const findQuery = mocks.logFind.mock.results[0].value;
    expect(findQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(findQuery.limit).toHaveBeenCalledWith(RECENT_LIMIT);
    expect(mocks.userFind).toHaveBeenCalledWith(
      { _id: { $in: ["u1", "u9"] } },
      { displayName: 1, email: 1 },
    );
    expect(stats.recent).toEqual([
      {
        id: "log2",
        createdAt: "2026-09-03T05:00:00.000Z",
        userId: "u1",
        userName: "はなこ",
        type: "spend",
        source: "gacha",
        label: "ガチャ",
        amount: -100,
        balanceAfter: 20,
      },
      {
        id: "log1",
        createdAt: "2026-09-02T05:00:00.000Z",
        userId: "u9",
        userName: "（不明なユーザー）",
        type: "earn",
        source: "meal",
        label: "食事の記録",
        amount: 3,
        balanceAfter: 120,
      },
    ]);
  });

  it("期間に記録が1件も無ければ 0 を返し、名前の問い合わせもしない", async () => {
    mocks.logAggregate.mockResolvedValue([{ bySource: [], users: [] }]);
    mocks.userAggregate.mockResolvedValue([]);
    mocks.logFind.mockReturnValue(query([]));

    const stats = await fetchAppPointStats(CONN, RANGE);

    expect(stats.totals).toEqual({
      earned: 0,
      earnCount: 0,
      spent: 0,
      spendCount: 0,
      users: 0,
    });
    expect(stats.balance).toEqual({ total: 0, holders: 0 });
    expect(stats.bySource).toEqual([]);
    expect(stats.recent).toEqual([]);
    expect(mocks.userFind).not.toHaveBeenCalled();
  });

  it("名前が無い人はメールで出す", async () => {
    mocks.userFind.mockReturnValue(
      query([
        { _id: "u1", email: "hanako@example.com" },
        { _id: "u9", displayName: "", email: "taro@example.com" },
      ]),
    );

    const stats = await fetchAppPointStats(CONN, RANGE);

    expect(stats.recent.map((r) => r.userName)).toEqual([
      "hanako@example.com",
      "taro@example.com",
    ]);
  });

  it("読み込みの失敗は握り潰さずに投げる", async () => {
    mocks.logAggregate.mockRejectedValue(new Error("boom"));

    await expect(fetchAppPointStats(CONN, RANGE)).rejects.toThrow("boom");
  });
});
