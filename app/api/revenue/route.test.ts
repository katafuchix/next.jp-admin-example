import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTotals } from "@/lib/ad-sources/overview";
import * as route from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectDB: vi.fn(),
  sumMonthlyBySource: vi.fn(),
  fetchSyncStatus: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@/lib/ad-sources/store", () => ({
  sumMonthlyBySource: mocks.sumMonthlyBySource,
  fetchSyncStatus: mocks.fetchSyncStatus,
}));

function get(query = "") {
  return route.GET(
    new NextRequest(`http://localhost/admin/api/revenue${query}`),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  // UTC では 2026-12-31 だが、JST ではもう 2027-01-01
  vi.useFakeTimers({ now: new Date("2026-12-31T16:00:00Z"), toFake: ["Date"] });
  mocks.auth.mockResolvedValue({ user: { id: "admin", role: "ANALYST" } });
  mocks.connectDB.mockResolvedValue(undefined);
  mocks.sumMonthlyBySource.mockResolvedValue([]);
  mocks.fetchSyncStatus.mockResolvedValue({
    latestRuns: new Map(),
    lastSuccess: new Map(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/revenue", () => {
  it("未ログインは 401", async () => {
    mocks.auth.mockResolvedValue(null);

    const res = await get("?year=2026");

    expect(res.status).toBe(401);
    expect(mocks.sumMonthlyBySource).not.toHaveBeenCalled();
  });

  it("年が4桁の数字でなければ 400", async () => {
    const res = await get("?year=2026|.*");
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({
      success: false,
      error: "年は4桁の数字で指定してください",
    });
    expect(mocks.sumMonthlyBySource).not.toHaveBeenCalled();
  });

  it("年の指定が無ければ日本時間の今年", async () => {
    const res = await get();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.sumMonthlyBySource).toHaveBeenCalledWith("2027");
    expect(json.data.year).toBe("2027");
  });

  it("取り込んだ日次データと同期の状態から月別の収支を組み立てる", async () => {
    mocks.sumMonthlyBySource.mockResolvedValue([
      {
        yearMonth: "2026-09",
        source: "tenjin",
        totals: { ...emptyTotals(), installs: 200, rows: 22 },
      },
      {
        yearMonth: "2026-09",
        source: "adgeneration",
        totals: { ...emptyTotals(), revenue: 5_000, rows: 30 },
      },
      // AdMob（Tenjin 経由）の収益は円未満の端数つきで入ってくる
      {
        yearMonth: "2026-09",
        source: "admob",
        totals: {
          ...emptyTotals(),
          revenue: 9.5,
          impressions: 479,
          clicks: 5,
          rows: 2,
        },
      },
    ]);
    mocks.fetchSyncStatus.mockResolvedValue({
      latestRuns: new Map(),
      lastSuccess: new Map([
        ["tenjin", new Date("2026-09-23T02:00:00Z")],
        ["admob", new Date("2026-09-23T02:00:00Z")],
        ["adgeneration", new Date("2026-09-23T02:00:00Z")],
      ]),
    });

    const res = await get("?year=2026");
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.rows).toEqual([
      {
        yearMonth: "2026-09",
        chargeRevenue: null,
        adRevenue: 5_009.5,
        total: 5_009.5,
        cost: null,
        profit: null,
      },
    ]);
    // 広告費は SmaAD の広告出稿から取る。Tenjin が同期に成功していても広告費は未接続
    expect(json.data.missing.cost).toEqual([
      { id: "smaad_spend", label: "SmaAD（広告出稿）" },
    ]);
    expect(json.data.missing.ad).toEqual([{ id: "smaad", label: "SmaAD" }]);
    expect(json.data.missing.charge).toEqual([
      { id: "appstore", label: "App Store Connect" },
      { id: "googleplay", label: "Google Play Console" },
    ]);
  });

  it("DB から取れなければ空のデータにせず 500 を返す", async () => {
    mocks.connectDB.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const res = await get("?year=2026");
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({
      success: false,
      error: "収益データの取得に失敗しました",
    });
  });
});
