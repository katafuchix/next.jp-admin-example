import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Connection } from "mongoose";
import { countPaidUsers, fetchUserMetrics } from "./query";

const mocks = vi.hoisted(() => ({
  statsAggregate: vi.fn(),
  statsFind: vi.fn(),
  userFind: vi.fn(),
  userCount: vi.fn(),
  withdrawalAggregate: vi.fn(),
  withdrawalFindOne: vi.fn(),
}));

/** Mongoose のクエリ（.sort().select().lean()）の代わり */
function query<T>(result: T) {
  const q = {
    sort: () => q,
    select: () => q,
    lean: () => Promise.resolve(result),
  };
  return q;
}

vi.mock("@/models/DashboardStats", () => ({
  getDashboardStatsModel: () => ({
    aggregate: mocks.statsAggregate,
    find: mocks.statsFind,
  }),
}));
vi.mock("@/models/AppUser", () => ({
  getAppUserModel: () => ({
    find: mocks.userFind,
    countDocuments: mocks.userCount,
  }),
}));
vi.mock("@/models/AppUserWithdrawal", () => ({
  getAppUserWithdrawalModel: () => ({
    aggregate: mocks.withdrawalAggregate,
    findOne: mocks.withdrawalFindOne,
  }),
}));

const CONN = {} as Connection;
const RANGE = { from: "2026-09-01", to: "2026-09-03", today: "2026-09-10" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.statsAggregate.mockResolvedValue([
    {
      daily: [
        { _id: "2026-09-01", count: 4 },
        { _id: "2026-09-03", count: 2 },
      ],
      period: [{ n: 5 }],
      wau: [{ n: 7 }],
      mau: [{ n: 12 }],
    },
  ]);
  mocks.userFind.mockReturnValue(
    query([
      {
        _id: "u1",
        createdAt: new Date("2026-09-01T01:00:00Z"),
        isPaid: true,
      },
      {
        _id: "u2",
        createdAt: new Date("2026-09-02T01:00:00Z"),
        isPaid: false,
      },
    ]),
  );
  mocks.statsFind.mockReturnValue(
    query([{ userId: "u1", date: new Date("2026-09-01T15:00:00Z") }]),
  );
  mocks.userCount.mockImplementation((filter: Record<string, unknown>) =>
    Promise.resolve("isPaid" in filter ? 30 : "createdAt" in filter ? 90 : 100),
  );
  mocks.withdrawalAggregate.mockResolvedValue([
    { _id: "admin", n: 2 },
    { _id: "app", n: 3 },
  ]);
  mocks.withdrawalFindOne.mockReturnValue(
    // JST 2026-09-01 01:00
    query({ withdrawnAt: new Date("2026-08-31T16:00:00Z") }),
  );
});

describe("fetchUserMetrics", () => {
  it("アクティブ系の数字を1回の集計でまとめて取り、日別は0埋めする", async () => {
    const result = await fetchUserMetrics(CONN, RANGE);

    expect(result.activity).toEqual({
      dau: [
        { day: "2026-09-01", count: 4 },
        { day: "2026-09-02", count: 0 },
        { day: "2026-09-03", count: 2 },
      ],
      avgDau: 2,
      wau: 7,
      mau: 12,
      activeUsers: 5,
      totalLogins: 6,
    });
    expect(mocks.statsAggregate).toHaveBeenCalledTimes(1);
  });

  it("MAU の窓（終了日の29日前）まで遡って JST の境界で読む", async () => {
    await fetchUserMetrics(CONN, RANGE);

    const [pipeline] = mocks.statsAggregate.mock.calls[0];
    expect(pipeline[0].$match.date.$gte.toISOString()).toBe(
      "2026-08-04T15:00:00.000Z", // JST 08-05 0時 = 09-03 の 29 日前
    );
    expect(pipeline[0].$match.date.$lt.toISOString()).toBe(
      "2026-09-03T15:00:00.000Z", // JST 09-04 0時（終了日の翌日）
    );
    const facet = pipeline.find(
      (s: Record<string, unknown>) => "$facet" in s,
    ).$facet;
    expect(facet.wau[0].$match["_id.day"]).toEqual({
      $gte: "2026-08-28",
      $lte: "2026-09-03",
    });
  });

  it("期間内の登録ユーザーから新規数・継続率・登録ヒートマップ・課金率を出す", async () => {
    const result = await fetchUserMetrics(CONN, RANGE);

    expect(result.users.total).toBe(90);
    expect(result.users.newUsers).toBe(2);
    expect(result.users.signupHeatmap.flat().reduce((s, n) => s + n, 0)).toBe(
      2,
    );
    // u1 は 09-01 登録・09-02（JST）にアクティブ → D1 継続
    expect(result.retention[0]).toEqual({
      day: 1,
      eligible: 2,
      retained: 1,
      rate: 0.5,
    });
    expect(result.paidRate).toEqual({
      overall: { paid: 30, total: 100, rate: 0.3 },
      cohort: { paid: 1, total: 2, rate: 0.5 },
    });
  });

  it("継続率の行は登録翌日から、まだ終わっていない日の手前（昨日）までだけ読む", async () => {
    await fetchUserMetrics(CONN, RANGE);

    const [filter] = mocks.statsFind.mock.calls[0];
    expect(filter.userId.$in).toEqual(["u1", "u2"]);
    expect(filter.date.$gte.toISOString()).toBe("2026-09-01T15:00:00.000Z");
    expect(filter.date.$lt.toISOString()).toBe("2026-09-09T15:00:00.000Z");
  });

  it("期間内の登録が0人なら継続率の行を読みに行かない", async () => {
    mocks.userFind.mockReturnValue(query([]));

    const result = await fetchUserMetrics(CONN, RANGE);

    expect(mocks.statsFind).not.toHaveBeenCalled();
    expect(result.retention.every((r) => r.rate === null)).toBe(true);
    expect(result.paidRate.cohort.rate).toBeNull();
  });

  it("期間内の退会を経路別に数え、最初の記録の日（JST）を添える", async () => {
    const result = await fetchUserMetrics(CONN, RANGE);

    expect(result.users.withdrawals).toEqual({
      total: 5,
      fromApp: 3,
      fromAdmin: 2,
      recordedSince: "2026-09-01",
    });
    const [pipeline] = mocks.withdrawalAggregate.mock.calls[0];
    expect(pipeline[0].$match.withdrawnAt.$gte.toISOString()).toBe(
      "2026-08-31T15:00:00.000Z", // JST 09-01 0時
    );
    expect(pipeline[0].$match.withdrawnAt.$lt.toISOString()).toBe(
      "2026-09-03T15:00:00.000Z", // JST 09-04 0時（終了日の翌日）
    );
  });

  it("退会の記録がまだ1件も無ければ 0 件・記録開始日なしを返す", async () => {
    mocks.withdrawalAggregate.mockResolvedValue([]);
    mocks.withdrawalFindOne.mockReturnValue(query(null));

    const result = await fetchUserMetrics(CONN, RANGE);

    expect(result.users.withdrawals).toEqual({
      total: 0,
      fromApp: 0,
      fromAdmin: 0,
      recordedSince: null,
    });
  });

  it("アクティブの記録が1件も無くても 0 を返す", async () => {
    mocks.statsAggregate.mockResolvedValue([
      { daily: [], period: [], wau: [], mau: [] },
    ]);

    const result = await fetchUserMetrics(CONN, RANGE);

    expect(result.activity).toMatchObject({
      avgDau: 0,
      wau: 0,
      mau: 0,
      activeUsers: 0,
      totalLogins: 0,
    });
  });
});

describe("countPaidUsers", () => {
  it("今の課金中ユーザー数と総ユーザー数を数える", async () => {
    expect(await countPaidUsers(CONN)).toEqual({ paid: 30, total: 100 });
    expect(mocks.userCount).toHaveBeenCalledWith({ isPaid: true });
    expect(mocks.userCount).toHaveBeenCalledWith({});
  });
});
