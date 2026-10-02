import { describe, expect, it } from "vitest";
import {
  buildAdOverview,
  buildDailyRevenue,
  emptyTotals,
  type SourceTotals,
} from "./overview";
import { AD_SOURCES } from "./registry";
import type { AdMetricKey, AdSource, AdSourceId } from "./types";

const RANGE = { from: "2026-09-01", to: "2026-09-30" };
const ALL: AdSourceId[] = [
  "tenjin",
  "smaad_spend",
  "admob",
  "adgeneration",
  "smaad",
  "appstore",
  "googleplay",
];
const SUCCESS_AT = new Date("2026-09-23T02:00:00Z");

/**
 * どの媒体も全指標を取り込み済みにした媒体一覧。pending に挙げた媒体だけ、その指標を取り込み前にする。
 */
function withPending(
  pending: Partial<Record<AdSourceId, AdMetricKey[]>> = {},
): AdSource[] {
  return AD_SOURCES.map((s) => ({ ...s, pendingMetrics: pending[s.id] ?? [] }));
}
const ALL_READY = withPending();

function totals(
  entries: Partial<Record<AdSourceId, Partial<SourceTotals>>>,
): Map<AdSourceId, SourceTotals> {
  return new Map(
    Object.entries(entries).map(([id, t]) => [
      id as AdSourceId,
      { ...emptyTotals(), ...t },
    ]),
  );
}

function connected(ids: AdSourceId[]): Map<AdSourceId, Date> {
  return new Map(ids.map((id) => [id, SUCCESS_AT]));
}

const FULL_TOTALS = totals({
  tenjin: { installs: 400, rows: 30 },
  smaad_spend: { spend: 100_000, conversions: 380, rows: 30 },
  admob: { revenue: 20_000 },
  adgeneration: { revenue: 30_000 },
  smaad: { revenue: 10_000 },
  appstore: { proceeds: 50_000, grossSales: 70_000 },
  googleplay: { proceeds: 20_000, grossSales: 28_000 },
});

describe("buildAdOverview", () => {
  it("全媒体つながっていれば、広告費・CPI・ROAS・ROI を出す（広告費は SmaAD の広告出稿、インストール数は Tenjin）", () => {
    const { kpis } = buildAdOverview({
      sources: ALL_READY,
      env: {},
      range: RANGE,
      totals: FULL_TOTALS,
      latestRuns: new Map(),
      lastSuccess: connected(ALL),
    });

    expect(kpis.spend).toEqual({ value: 100_000, missing: [] });
    expect(kpis.installs).toEqual({ value: 400, missing: [] });
    expect(kpis.cpi).toEqual({ value: 250, missing: [] });
    expect(kpis.adRevenue).toEqual({ value: 60_000, missing: [] });
    expect(kpis.salesProceeds).toEqual({ value: 70_000, missing: [] });
    expect(kpis.totalRevenue).toEqual({ value: 130_000, missing: [] });
    expect(kpis.roas).toEqual({ value: 1.3, missing: [] });
    expect(kpis.roi.value).toBeCloseTo(0.3);
  });

  it("一部しかつながっていなければ、合計はつながった分だけ出し、率は出さない", () => {
    const { kpis } = buildAdOverview({
      sources: ALL_READY,
      env: {},
      range: RANGE,
      totals: FULL_TOTALS,
      latestRuns: new Map(),
      lastSuccess: connected(["tenjin", "smaad_spend", "admob"]),
    });

    expect(kpis.spend).toEqual({ value: 100_000, missing: [] });
    expect(kpis.cpi).toEqual({ value: 250, missing: [] });
    expect(kpis.adRevenue).toEqual({
      value: 20_000,
      missing: ["adgeneration", "smaad"],
    });
    expect(kpis.salesProceeds).toEqual({
      value: null,
      missing: ["appstore", "googleplay"],
    });
    expect(kpis.roas).toEqual({
      value: null,
      missing: ["adgeneration", "smaad", "appstore", "googleplay"],
    });
    expect(kpis.roi.value).toBeNull();
  });

  it("どれもつながっていなければ全部「値なし」", () => {
    const { kpis } = buildAdOverview({
      sources: ALL_READY,
      env: {},
      range: RANGE,
      totals: new Map(),
      latestRuns: new Map(),
      lastSuccess: new Map(),
    });

    expect(kpis.spend).toEqual({ value: null, missing: ["smaad_spend"] });
    expect(kpis.installs).toEqual({ value: null, missing: ["tenjin"] });
    expect(kpis.cpi).toEqual({ value: null, missing: ["tenjin", "smaad_spend"] });
    expect(kpis.roas.value).toBeNull();
  });

  it("Tenjin に広告費が入っていても数えず、SmaAD の広告出稿の成果件数もインストール数に混ぜない", () => {
    const { kpis } = buildAdOverview({
      sources: ALL_READY,
      env: {},
      range: RANGE,
      totals: totals({
        tenjin: { spend: 999_999, installs: 400 },
        smaad_spend: { spend: 100_000, installs: 777, conversions: 380 },
      }),
      latestRuns: new Map(),
      lastSuccess: connected(ALL),
    });

    expect(kpis.spend.value).toBe(100_000);
    expect(kpis.installs.value).toBe(400);
    expect(kpis.cpi.value).toBe(250);
  });

  it("広告費やインストールが0なら、割り算の指標は出さない", () => {
    const { kpis } = buildAdOverview({
      sources: ALL_READY,
      env: {},
      range: RANGE,
      totals: totals({ admob: { revenue: 5_000 } }),
      latestRuns: new Map(),
      lastSuccess: connected(ALL),
    });

    expect(kpis.spend.value).toBe(0);
    expect(kpis.cpi.value).toBeNull();
    expect(kpis.roas.value).toBeNull();
    expect(kpis.roi.value).toBeNull();
  });

  it("媒体ごとに、認証情報の有無・期間の合計・最新の同期・最後に成功した日時を返す", () => {
    const finishedAt = new Date("2026-09-23T09:00:10Z");
    const { sources } = buildAdOverview({
      sources: ALL_READY,
      env: { TENJIN_API_KEY: "key" },
      range: RANGE,
      totals: FULL_TOTALS,
      latestRuns: new Map([
        [
          "tenjin",
          {
            status: "failed",
            trigger: "cron",
            rowCount: 0,
            message: "API キーが無効です",
            finishedAt,
          },
        ],
      ]),
      lastSuccess: connected(["tenjin"]),
    });

    expect(sources.map((s) => s.id)).toEqual(ALL);
    expect(sources[0]).toEqual({
      id: "tenjin",
      label: "Tenjin",
      provides: ALL_READY[0].provides,
      configured: true,
      totals: { ...emptyTotals(), installs: 400, rows: 30 },
      latestRun: {
        status: "failed",
        trigger: "cron",
        rowCount: 0,
        message: "API キーが無効です",
        finishedAt: finishedAt.toISOString(),
      },
      lastSuccessAt: SUCCESS_AT.toISOString(),
      pendingMetrics: [],
      csvImport: false,
    });
    // AdMob も Tenjin の API キーで取るので、Tenjin のキーがあれば設定済み
    expect(sources.find((s) => s.id === "admob")).toMatchObject({
      id: "admob",
      configured: true,
      latestRun: null,
      lastSuccessAt: null,
    });
  });

  it("広告費をまだ取り込んでいない媒体は、同期に成功していても広告費を未接続として扱い、CPI・ROAS・ROI を出さない", () => {
    const { kpis, sources } = buildAdOverview({
      sources: withPending({ smaad_spend: ["spend"] }),
      env: {},
      range: RANGE,
      totals: FULL_TOTALS,
      latestRuns: new Map(),
      lastSuccess: connected(ALL),
    });

    expect(kpis.spend).toEqual({ value: null, missing: ["smaad_spend"] });
    expect(kpis.installs).toEqual({ value: 400, missing: [] });
    expect(kpis.cpi).toEqual({ value: null, missing: ["smaad_spend"] });
    expect(kpis.totalRevenue).toEqual({ value: 130_000, missing: [] });
    expect(kpis.roas).toEqual({ value: null, missing: ["smaad_spend"] });
    expect(kpis.roi).toEqual({ value: null, missing: ["smaad_spend"] });
    expect(sources.find((s) => s.id === "smaad_spend")?.pendingMetrics).toEqual([
      "spend",
    ]);
  });

  it("本番の媒体一覧では、広告費もインストール数も取り込み前の扱いにしない", () => {
    const { kpis } = buildAdOverview({
      sources: AD_SOURCES,
      env: {},
      range: RANGE,
      totals: FULL_TOTALS,
      latestRuns: new Map(),
      lastSuccess: connected(ALL),
    });

    expect(kpis.spend).toEqual({ value: 100_000, missing: [] });
    expect(kpis.cpi).toEqual({ value: 250, missing: [] });
  });

  it("CSV を画面から取り込む媒体には csvImport を立てる（自動の同期では取りに行かない印）", () => {
    const { sources } = buildAdOverview({
      sources: AD_SOURCES,
      env: {},
      range: RANGE,
      totals: new Map(),
      latestRuns: new Map(),
      lastSuccess: new Map(),
    });

    expect(sources.filter((s) => s.csvImport).map((s) => s.id)).toEqual([
      "smaad_spend",
      "smaad",
    ]);
  });
});

describe("buildDailyRevenue", () => {
  const WEEK = { from: "2026-09-20", to: "2026-09-22" };

  it("期間の毎日を新しい日から並べ、つながった広告収益の媒体だけを列にする", () => {
    const daily = buildDailyRevenue({
      sources: ALL_READY,
      lastSuccess: connected(["admob", "smaad"]),
      range: WEEK,
      daily: [
        { source: "admob", date: "2026-09-22", value: 1_200 },
        { source: "smaad", date: "2026-09-22", value: 300 },
        { source: "admob", date: "2026-09-20", value: 800 },
        // つながっていない媒体の行は数えない
        { source: "adgeneration", date: "2026-09-22", value: 9_999 },
      ],
    });

    expect(daily.sources).toEqual(["admob", "smaad"]);
    expect(daily.missing).toEqual(["adgeneration"]);
    expect(daily.rows).toEqual([
      { date: "2026-09-22", values: [1_200, 300], total: 1_500 },
      { date: "2026-09-21", values: [null, null], total: null },
      { date: "2026-09-20", values: [800, null], total: 800 },
    ]);
    expect(daily.totals).toEqual({ values: [2_000, 300], total: 2_300 });
  });

  it("取り込んだ行があって0円の日は0、行が無い日は null（0円と区別する）", () => {
    const daily = buildDailyRevenue({
      sources: ALL_READY,
      lastSuccess: connected(["admob"]),
      range: { from: "2026-09-21", to: "2026-09-22" },
      daily: [{ source: "admob", date: "2026-09-22", value: 0 }],
    });

    expect(daily.rows).toEqual([
      { date: "2026-09-22", values: [0], total: 0 },
      { date: "2026-09-21", values: [null], total: null },
    ]);
    expect(daily.totals).toEqual({ values: [0], total: 0 });
  });

  it("広告収益の媒体が1つもつながっていなければ列は空で、全媒体を未接続にする", () => {
    const daily = buildDailyRevenue({
      sources: ALL_READY,
      lastSuccess: connected(["tenjin", "appstore"]),
      range: WEEK,
      daily: [],
    });

    expect(daily.sources).toEqual([]);
    expect(daily.missing).toEqual(["admob", "adgeneration", "smaad"]);
    expect(daily.rows).toHaveLength(3);
    expect(daily.totals).toEqual({ values: [], total: null });
  });

  it("収益を取り込み前の媒体は、同期に成功していても列に入れない", () => {
    const daily = buildDailyRevenue({
      sources: withPending({ smaad: ["revenue"] }),
      lastSuccess: connected(["admob", "smaad"]),
      range: WEEK,
      daily: [{ source: "smaad", date: "2026-09-22", value: 300 }],
    });

    expect(daily.sources).toEqual(["admob"]);
    expect(daily.missing).toEqual(["adgeneration", "smaad"]);
    expect(daily.rows[0]).toEqual({
      date: "2026-09-22",
      values: [null],
      total: null,
    });
  });

  it("buildAdOverview は日別の収益を dailyRevenue に入れ、期間合計は広告収益の指標と一致する", () => {
    const overview = buildAdOverview({
      sources: ALL_READY,
      env: {},
      range: WEEK,
      totals: totals({ admob: { revenue: 2_000 }, smaad: { revenue: 300 } }),
      latestRuns: new Map(),
      lastSuccess: connected(["admob", "smaad"]),
      dailyRevenue: [
        { source: "admob", date: "2026-09-22", value: 1_200 },
        { source: "admob", date: "2026-09-20", value: 800 },
        { source: "smaad", date: "2026-09-21", value: 300 },
      ],
    });

    expect(overview.dailyRevenue.sources).toEqual(["admob", "smaad"]);
    expect(overview.dailyRevenue.rows.map((r) => r.date)).toEqual([
      "2026-09-22",
      "2026-09-21",
      "2026-09-20",
    ]);
    expect(overview.dailyRevenue.totals.total).toBe(overview.kpis.adRevenue.value);
  });
});
