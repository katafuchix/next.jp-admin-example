import {
  buildAdOverview,
  emptyTotals,
  type AdOverview,
  type DailyValue,
  type LatestRun,
  type SourceTotals,
} from "@/lib/ad-sources/overview";
import { AD_SOURCES } from "@/lib/ad-sources/registry";
import type { AdMetrics, AdSourceId } from "@/lib/ad-sources/types";

const RANGE = { from: "2026-08-24", to: "2026-09-22" };
/** JST 2026-09-23 09:30 */
const SYNCED_AT = new Date("2026-09-23T00:30:00Z");

/** 収益の5媒体を全部取り込めたときの期間合計（収益合計 ￥90,000・課金の手取り ￥55,000） */
const REVENUE_TOTALS: Partial<Record<AdSourceId, Partial<AdMetrics>>> = {
  admob: { revenue: 20_000 },
  adgeneration: { revenue: 10_000 },
  smaad: { revenue: 5_000 },
  appstore: { proceeds: 40_000, grossSales: 57_000 },
  googleplay: { proceeds: 15_000, grossSales: 21_000 },
};

/**
 * 画面テスト用の GET /api/ads の応答（JST 2026-09-23 に開いた想定）。
 * 本物の組み立て処理を通すので、API と形がずれない。
 * connected のときは Tenjin（インストール数）だけ取り込み済み・AdMob は失敗・ほかは未接続。
 * spendConnected のときは SmaAD（広告出稿）の広告費を CSV で取り込み済みにする。
 * revenueConnected のときは収益の5媒体（広告3つ・ストア2つ）を取り込み済みにする。
 * dailyRevenue は広告収益の媒体×日の値（日別の表に出る）。
 */
export function buildOverview({
  connected = false,
  spendConnected = false,
  revenueConnected = false,
  dailyRevenue = [],
}: {
  connected?: boolean;
  spendConnected?: boolean;
  revenueConnected?: boolean;
  dailyRevenue?: DailyValue[];
} = {}): AdOverview {
  const totals = new Map<AdSourceId, SourceTotals>();
  const latestRuns = new Map<AdSourceId, LatestRun>();
  const lastSuccess = new Map<AdSourceId, Date>();

  if (connected) {
    totals.set("tenjin", { ...emptyTotals(), installs: 300, rows: 30 });
    latestRuns.set("tenjin", {
      status: "success",
      trigger: "cron",
      rowCount: 7,
      message: null,
      finishedAt: SYNCED_AT,
    });
    lastSuccess.set("tenjin", SYNCED_AT);
    latestRuns.set("admob", {
      status: "failed",
      trigger: "manual",
      rowCount: 0,
      message: "AdMob の認証が切れています",
      finishedAt: SYNCED_AT,
    });
  }

  if (spendConnected) {
    totals.set("smaad_spend", {
      ...emptyTotals(),
      spend: 90_000,
      conversions: 280,
      rows: 30,
    });
    latestRuns.set("smaad_spend", {
      status: "success",
      trigger: "csv",
      rowCount: 30,
      message: null,
      finishedAt: SYNCED_AT,
    });
    lastSuccess.set("smaad_spend", SYNCED_AT);
  }

  if (revenueConnected) {
    for (const [id, metrics] of Object.entries(REVENUE_TOTALS)) {
      const sourceId = id as AdSourceId;
      totals.set(sourceId, { ...emptyTotals(), ...metrics, rows: 30 });
      lastSuccess.set(sourceId, SYNCED_AT);
    }
  }

  const overview = buildAdOverview({
    sources: AD_SOURCES.map((s) => ({ ...s, pendingMetrics: [] })),
    env: {},
    range: RANGE,
    totals,
    latestRuns,
    lastSuccess,
    dailyRevenue,
  });
  return JSON.parse(JSON.stringify(overview));
}
