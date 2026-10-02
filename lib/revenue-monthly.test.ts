import { describe, expect, it } from "vitest";
import { emptyTotals, type SourceTotals } from "@/lib/ad-sources/overview";
import { AD_SOURCES } from "@/lib/ad-sources/registry";
import type { AdMetricKey, AdSource, AdSourceId } from "@/lib/ad-sources/types";
import {
  buildMonthlyRevenue,
  type MonthlyRevenue,
  type MonthlySourceTotals,
} from "./revenue-monthly";

const SYNCED = new Date("2026-09-23T02:00:00Z");
const ALL: AdSourceId[] = [
  "tenjin",
  "smaad_spend",
  "admob",
  "adgeneration",
  "smaad",
  "appstore",
  "googleplay",
];

/**
 * どの媒体も全指標を取り込み済みにした媒体一覧。pending に挙げた媒体だけ、その指標を取り込み前にする。
 */
function withPending(
  pending: Partial<Record<AdSourceId, AdMetricKey[]>> = {},
): AdSource[] {
  return AD_SOURCES.map((s) => ({ ...s, pendingMetrics: pending[s.id] ?? [] }));
}
const ALL_READY = withPending();

function ids(missing: MonthlyRevenue["missing"]) {
  return {
    charge: missing.charge.map((s) => s.id),
    ad: missing.ad.map((s) => s.id),
    cost: missing.cost.map((s) => s.id),
  };
}

function connected(ids: AdSourceId[]): Map<AdSourceId, Date> {
  return new Map(ids.map((id) => [id, SYNCED]));
}

function month(
  yearMonth: string,
  source: AdSourceId,
  metrics: Partial<SourceTotals>,
): MonthlySourceTotals {
  return {
    yearMonth,
    source,
    totals: { ...emptyTotals(), rows: 1, ...metrics },
  };
}

describe("buildMonthlyRevenue", () => {
  it("何もつながっていなければ月の行は無く、足りない媒体を種類ごとに返す", () => {
    const result = buildMonthlyRevenue({
      year: "2026",
      monthly: [],
      lastSuccess: new Map(),
    });

    expect(result.rows).toEqual([]);
    expect(ids(result.missing)).toEqual({
      charge: ["appstore", "googleplay"],
      ad: ["admob", "adgeneration", "smaad"],
      cost: ["smaad_spend"],
    });
    expect(result.missing.cost[0]).toEqual({
      id: "smaad_spend",
      label: "SmaAD（広告出稿）",
    });
    expect(result.missing.charge[0]).toEqual({
      id: "appstore",
      label: "App Store Connect",
    });
    expect(result.totals).toEqual({
      chargeRevenue: null,
      adRevenue: null,
      total: null,
      cost: null,
      profit: null,
    });
  });

  it("課金は手取り、広告は収益、広告費は SmaAD の広告出稿の利用金額を月ごとに足し、月の古い順に並べる", () => {
    const result = buildMonthlyRevenue({
      year: "2026",
      monthly: [
        month("2026-09", "appstore", { proceeds: 30_000, grossSales: 42_000 }),
        month("2026-09", "googleplay", { proceeds: 10_000 }),
        month("2026-09", "admob", { revenue: 5_000 }),
        month("2026-09", "adgeneration", { revenue: 3_000 }),
        month("2026-09", "smaad", { revenue: 2_000 }),
        month("2026-09", "smaad_spend", { spend: 20_000 }),
        month("2026-08", "appstore", { proceeds: 25_000 }),
        month("2026-08", "smaad_spend", { spend: 40_000 }),
      ],
      lastSuccess: connected(ALL),
      sources: ALL_READY,
    });

    expect(result.rows).toEqual([
      {
        yearMonth: "2026-08",
        chargeRevenue: 25_000,
        adRevenue: 0,
        total: 25_000,
        cost: 40_000,
        profit: -15_000,
      },
      {
        yearMonth: "2026-09",
        chargeRevenue: 40_000,
        adRevenue: 10_000,
        total: 50_000,
        cost: 20_000,
        profit: 30_000,
      },
    ]);
    expect(result.totals).toEqual({
      chargeRevenue: 65_000,
      adRevenue: 10_000,
      total: 75_000,
      cost: 60_000,
      profit: 15_000,
    });
    expect(result.missing).toEqual({ charge: [], ad: [], cost: [] });
  });

  it("つながっていない種類は値なし。一部だけで引き算すると赤字に見えるので、粗利は全媒体がそろうまで出さない", () => {
    const result = buildMonthlyRevenue({
      year: "2026",
      monthly: [
        month("2026-09", "smaad_spend", { spend: 20_000 }),
        month("2026-09", "admob", { revenue: 5_000 }),
      ],
      lastSuccess: connected(["smaad_spend", "admob"]),
      sources: ALL_READY,
    });

    expect(result.rows).toEqual([
      {
        yearMonth: "2026-09",
        chargeRevenue: null,
        adRevenue: 5_000,
        total: 5_000,
        cost: 20_000,
        profit: null,
      },
    ]);
    expect(ids(result.missing)).toEqual({
      charge: ["appstore", "googleplay"],
      ad: ["adgeneration", "smaad"],
      cost: [],
    });
    expect(result.totals.profit).toBeNull();
  });

  it("別の年の月は混ぜない", () => {
    const result = buildMonthlyRevenue({
      year: "2026",
      monthly: [
        month("2025-12", "smaad_spend", { spend: 9_999 }),
        month("2026-01", "smaad_spend", { spend: 1_000 }),
      ],
      lastSuccess: connected(["smaad_spend"]),
      sources: ALL_READY,
    });

    expect(result.rows.map((r) => r.yearMonth)).toEqual(["2026-01"]);
    expect(result.totals.cost).toBe(1_000);
  });

  it("広告費をまだ取り込んでいない媒体は、同期に成功していても広告費を値なしにし、粗利も出さない", () => {
    const result = buildMonthlyRevenue({
      year: "2026",
      monthly: [
        month("2026-09", "appstore", { proceeds: 30_000 }),
        month("2026-09", "admob", { revenue: 5_000 }),
        month("2026-09", "smaad_spend", { spend: 20_000 }),
      ],
      lastSuccess: connected(ALL),
      sources: withPending({ smaad_spend: ["spend"] }),
    });

    expect(result.rows).toEqual([
      {
        yearMonth: "2026-09",
        chargeRevenue: 30_000,
        adRevenue: 5_000,
        total: 35_000,
        cost: null,
        profit: null,
      },
    ]);
    expect(ids(result.missing)).toEqual({ charge: [], ad: [], cost: ["smaad_spend"] });
    expect(result.totals.profit).toBeNull();
  });

  it("本番の媒体一覧では、広告費は SmaAD の広告出稿だけを数え、Tenjin に広告費が入っていても足さない", () => {
    const result = buildMonthlyRevenue({
      year: "2026",
      monthly: [
        month("2026-09", "tenjin", { spend: 999_999, installs: 200 }),
        month("2026-09", "smaad_spend", { spend: 20_000 }),
      ],
      lastSuccess: connected(ALL),
    });

    expect(result.totals.cost).toBe(20_000);
    expect(ids(result.missing).cost).toEqual([]);
  });
});
