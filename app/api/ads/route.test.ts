import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as route from "./route";
import { emptyTotals } from "@/lib/ad-sources/overview";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectDB: vi.fn(),
  sumDailyBySource: vi.fn(),
  sumDailyBySourceAndDay: vi.fn(),
  fetchSyncStatus: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@/lib/ad-sources/store", () => ({
  sumDailyBySource: mocks.sumDailyBySource,
  sumDailyBySourceAndDay: mocks.sumDailyBySourceAndDay,
  fetchSyncStatus: mocks.fetchSyncStatus,
}));

function get(query = "") {
  return route.GET(new NextRequest(`http://localhost/admin/api/ads${query}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  // JST 2026-09-23 10:00
  vi.useFakeTimers({ now: new Date("2026-09-23T01:00:00Z"), toFake: ["Date"] });
  mocks.auth.mockResolvedValue({ user: { id: "admin", role: "ANALYST" } });
  mocks.connectDB.mockResolvedValue(undefined);
  mocks.sumDailyBySource.mockResolvedValue(new Map());
  mocks.sumDailyBySourceAndDay.mockResolvedValue([]);
  mocks.fetchSyncStatus.mockResolvedValue({
    latestRuns: new Map(),
    lastSuccess: new Map(),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/ads", () => {
  it("未ログインは 401", async () => {
    mocks.auth.mockResolvedValue(null);

    const res = await get();

    expect(res.status).toBe(401);
    expect(mocks.sumDailyBySource).not.toHaveBeenCalled();
  });

  it("期間の指定が無ければ昨日までの30日間。何もつながっていなければ指標は全部「値なし」", async () => {
    const res = await get();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.sumDailyBySource).toHaveBeenCalledWith({
      from: "2026-08-24",
      to: "2026-09-22",
    });
    expect(json.data.range).toEqual({ from: "2026-08-24", to: "2026-09-22" });
    expect(json.data.sources).toHaveLength(7);
    expect(json.data.kpis.spend).toEqual({ value: null, missing: ["smaad_spend"] });
    expect(json.data.kpis.roas.value).toBeNull();
  });

  it("取り込み済みの合計と同期の状態から指標を組み立てる", async () => {
    const finishedAt = new Date("2026-09-23T00:30:00Z");
    mocks.sumDailyBySource.mockResolvedValue(
      new Map([
        [
          "tenjin",
          { ...emptyTotals(), installs: 300, rows: 30 },
        ],
      ]),
    );
    mocks.fetchSyncStatus.mockResolvedValue({
      latestRuns: new Map([
        [
          "tenjin",
          {
            status: "success",
            trigger: "cron",
            rowCount: 7,
            message: null,
            finishedAt,
          },
        ],
      ]),
      lastSuccess: new Map([["tenjin", finishedAt]]),
    });

    const json = await (await get("?from=2026-09-01&to=2026-09-30")).json();

    expect(mocks.sumDailyBySource).toHaveBeenCalledWith({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(json.data.kpis.installs).toEqual({ value: 300, missing: [] });
    // 広告費は SmaAD の広告出稿の CSV から取る。まだ取り込んでいないので、0円と出さずに未接続のまま
    expect(json.data.kpis.spend).toEqual({ value: null, missing: ["smaad_spend"] });
    expect(json.data.kpis.cpi).toEqual({ value: null, missing: ["smaad_spend"] });
    expect(json.data.sources[0]).toMatchObject({
      id: "tenjin",
      lastSuccessAt: finishedAt.toISOString(),
      pendingMetrics: [],
      latestRun: { status: "success", finishedAt: finishedAt.toISOString() },
    });
  });

  it("広告収益の3媒体を日別に集計し、つながった媒体だけを日別の表に出す", async () => {
    const finishedAt = new Date("2026-09-23T00:30:00Z");
    mocks.sumDailyBySourceAndDay.mockResolvedValue([
      { source: "admob", date: "2026-09-22", value: 1_200 },
    ]);
    mocks.fetchSyncStatus.mockResolvedValue({
      latestRuns: new Map(),
      lastSuccess: new Map([["admob", finishedAt]]),
    });

    const json = await (await get("?from=2026-09-21&to=2026-09-22")).json();

    expect(mocks.sumDailyBySourceAndDay).toHaveBeenCalledWith(
      { from: "2026-09-21", to: "2026-09-22" },
      ["admob", "adgeneration", "smaad"],
      "revenue",
    );
    expect(json.data.dailyRevenue).toEqual({
      sources: ["admob"],
      missing: ["adgeneration", "smaad"],
      rows: [
        { date: "2026-09-22", values: [1_200], total: 1_200 },
        { date: "2026-09-21", values: [null], total: null },
      ],
      totals: { values: [1_200], total: 1_200 },
    });
  });

  it.each([
    ["日付の形が違う", "?from=2026/09/01&to=2026-09-10"],
    ["開始日が終了日より後", "?from=2026-09-10&to=2026-09-01"],
    ["366日を超える", "?from=2025-01-01&to=2026-09-01"],
  ])("%s は 400", async (_, query) => {
    const res = await get(query);

    expect(res.status).toBe(400);
    expect(mocks.sumDailyBySource).not.toHaveBeenCalled();
  });

  it("DB で失敗したら 500 を返し、内部のエラー文は出さない", async () => {
    mocks.sumDailyBySource.mockRejectedValue(new Error("secret detail"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await get();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      error: "広告データの取得に失敗しました",
    });
  });

  it("旧来のモック同期（POST）はもう受け付けない", () => {
    expect("POST" in route).toBe(false);
  });
});
