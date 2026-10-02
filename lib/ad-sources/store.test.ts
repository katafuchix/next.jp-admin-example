import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTotals } from "./overview";
import {
  createMongoAdSyncStore,
  fetchSyncStatus,
  sumDailyBySource,
  sumDailyBySourceAndDay,
  sumMonthlyBySource,
} from "./store";

const mocks = vi.hoisted(() => ({
  bulkWrite: vi.fn(),
  deleteMany: vi.fn(),
  dailyAggregate: vi.fn(),
  create: vi.fn(),
  runAggregate: vi.fn(),
}));

vi.mock("@/models/AdDailyStat", () => ({
  AdDailyStat: {
    bulkWrite: mocks.bulkWrite,
    deleteMany: mocks.deleteMany,
    aggregate: mocks.dailyAggregate,
  },
}));
vi.mock("@/models/AdSyncRun", () => ({
  AdSyncRun: { create: mocks.create, aggregate: mocks.runAggregate },
}));

const FETCHED_AT = new Date("2026-09-23T02:00:00Z");
const RANGE = { from: "2026-09-16", to: "2026-09-22" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createMongoAdSyncStore", () => {
  it("媒体・日付・キーで上書きし、取得に無い指標は0に戻す", async () => {
    await createMongoAdSyncStore().upsertDaily(
      "tenjin",
      [
        { date: "2026-09-22", key: "c1", label: "春", metrics: { spend: 500 } },
        { date: "2026-09-22", key: "c2", metrics: { installs: 3 } },
      ],
      FETCHED_AT,
    );

    const [ops, options] = mocks.bulkWrite.mock.calls[0];
    expect(options).toEqual({ ordered: false });
    expect(ops[0]).toEqual({
      updateOne: {
        filter: { source: "tenjin", date: "2026-09-22", key: "c1" },
        update: {
          $set: {
            label: "春",
            spend: 500,
            installs: 0,
            revenue: 0,
            impressions: 0,
            clicks: 0,
            conversions: 0,
            grossSales: 0,
            proceeds: 0,
            fetchedAt: FETCHED_AT,
          },
        },
        upsert: true,
      },
    });
    expect(ops[1].updateOne.update.$set).toMatchObject({
      label: "c2",
      spend: 0,
      installs: 3,
    });
    expect(ops[1].updateOne.update.$set).not.toHaveProperty("rows");
  });

  it("行が無ければDBに書きにいかない", async () => {
    await createMongoAdSyncStore().upsertDaily("tenjin", [], FETCHED_AT);

    expect(mocks.bulkWrite).not.toHaveBeenCalled();
  });

  it("期間内で今回より前に書かれた行だけを消す", async () => {
    mocks.deleteMany.mockResolvedValue({ deletedCount: 2 });

    const removed = await createMongoAdSyncStore().removeStale(
      "admob",
      RANGE,
      FETCHED_AT,
    );

    expect(removed).toBe(2);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      source: "admob",
      date: { $gte: "2026-09-16", $lte: "2026-09-22" },
      fetchedAt: { $lt: FETCHED_AT },
    });
  });
});

describe("sumDailyBySource", () => {
  it("期間で絞って媒体ごとに合計し、欠けた指標は0で埋める", async () => {
    mocks.dailyAggregate.mockResolvedValue([
      { _id: "tenjin", spend: 1_000, installs: 4, rows: 2 },
    ]);

    const totals = await sumDailyBySource(RANGE);

    const [pipeline] = mocks.dailyAggregate.mock.calls[0];
    expect(pipeline[0]).toEqual({
      $match: { date: { $gte: "2026-09-16", $lte: "2026-09-22" } },
    });
    expect(pipeline[1].$group).toMatchObject({
      _id: "$source",
      spend: { $sum: "$spend" },
      proceeds: { $sum: "$proceeds" },
      rows: { $sum: 1 },
    });
    expect(totals.get("tenjin")).toEqual({
      ...emptyTotals(),
      spend: 1_000,
      installs: 4,
      rows: 2,
    });
  });
});

describe("sumMonthlyBySource", () => {
  it("その年の日次データを媒体×月（JST）で合計する", async () => {
    mocks.dailyAggregate.mockResolvedValue([
      {
        _id: { source: "appstore", yearMonth: "2026-09" },
        proceeds: 30_000,
        grossSales: 42_000,
        rows: 22,
      },
    ]);

    const monthly = await sumMonthlyBySource("2026");

    const [pipeline] = mocks.dailyAggregate.mock.calls[0];
    expect(pipeline[0]).toEqual({
      $match: { date: { $gte: "2026-01-01", $lte: "2026-12-31" } },
    });
    expect(pipeline[1].$group).toMatchObject({
      _id: { source: "$source", yearMonth: { $substrBytes: ["$date", 0, 7] } },
      proceeds: { $sum: "$proceeds" },
      rows: { $sum: 1 },
    });
    expect(monthly).toEqual([
      {
        yearMonth: "2026-09",
        source: "appstore",
        totals: {
          ...emptyTotals(),
          proceeds: 30_000,
          grossSales: 42_000,
          rows: 22,
        },
      },
    ]);
  });
});

describe("fetchSyncStatus", () => {
  it("媒体ごとの最新の同期と、最後の成功日時を返す", async () => {
    const run = {
      status: "failed",
      trigger: "cron",
      rowCount: 0,
      message: "x",
      finishedAt: FETCHED_AT,
    };
    mocks.runAggregate
      .mockResolvedValueOnce([{ _id: "tenjin", run }])
      .mockResolvedValueOnce([{ _id: "tenjin", at: FETCHED_AT }]);

    const status = await fetchSyncStatus();

    expect(status.latestRuns.get("tenjin")).toEqual(run);
    expect(status.lastSuccess.get("tenjin")).toEqual(FETCHED_AT);
    expect(mocks.runAggregate.mock.calls[1][0][0]).toEqual({
      $match: { status: "success" },
    });
  });
});

describe("sumDailyBySourceAndDay", () => {
  it("期間と媒体で絞り、媒体×日ごとに1つの指標を合計する", async () => {
    mocks.dailyAggregate.mockResolvedValue([
      { _id: { source: "admob", date: "2026-09-22" }, value: 1_200 },
      { _id: { source: "smaad", date: "2026-09-21" }, value: 300 },
    ]);

    const rows = await sumDailyBySourceAndDay(
      RANGE,
      ["admob", "smaad"],
      "revenue",
    );

    const [pipeline] = mocks.dailyAggregate.mock.calls[0];
    expect(pipeline).toEqual([
      {
        $match: {
          date: { $gte: "2026-09-16", $lte: "2026-09-22" },
          source: { $in: ["admob", "smaad"] },
        },
      },
      {
        $group: {
          _id: { source: "$source", date: "$date" },
          value: { $sum: "$revenue" },
        },
      },
    ]);
    expect(rows).toEqual([
      { source: "admob", date: "2026-09-22", value: 1_200 },
      { source: "smaad", date: "2026-09-21", value: 300 },
    ]);
  });
});
