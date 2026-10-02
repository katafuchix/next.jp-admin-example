import type { AdSyncStatus, AdSyncTrigger } from "@/lib/ad-sync";
import { listDayKeys } from "@/lib/jst-date";
import { hasJoined, missingEnv } from "./registry";
import {
  AD_METRIC_KEYS,
  AD_SOURCE_IDS,
  type AdMetricKey,
  type AdMetrics,
  type AdSource,
  type AdSourceId,
  type DayRange,
  type Env,
} from "./types";

/**
 * 広告データ画面に出す「媒体ごとの状態」と「広告費・CPI・ROAS・ROI などの指標」を組み立てる。
 * 一度も取り込みに成功していない媒体と、まだ取り込んでいない指標（pendingMetrics）は「未接続」として扱い、
 * 合計はつながった媒体の分だけ、率（CPI・ROAS・ROI）は必要な媒体がそろうまで出さない。
 */

export type SourceTotals = AdMetrics & { rows: number };

export interface LatestRun {
  status: AdSyncStatus;
  trigger: AdSyncTrigger;
  rowCount: number;
  message: string | null;
  finishedAt: Date;
}

export interface AdSourceOverview {
  id: AdSourceId;
  label: string;
  provides: string;
  configured: boolean;
  totals: SourceTotals;
  latestRun: (Omit<LatestRun, "finishedAt"> & { finishedAt: string }) | null;
  lastSuccessAt: string | null;
  /** 取るはずだが、まだ取り込んでいない指標 */
  pendingMetrics: AdMetricKey[];
  /** API が無く、管理画面の CSV を画面から取り込む媒体 */
  csvImport: boolean;
}

export interface Kpi {
  value: number | null;
  /** 値の計算に必要なのに、まだつながっていない媒体 */
  missing: AdSourceId[];
}

/** 媒体×日の1つの値（store の日別集計の結果） */
export interface DailyValue {
  source: AdSourceId;
  date: string;
  value: number;
}

/** 列の並びは DailyRevenue.sources と同じ。取り込んだ行が無い日は null（0円と区別する） */
export interface DailyRevenueRow {
  date: string;
  values: (number | null)[];
  /** 値のある媒体の合計。どの媒体にも値が無ければ null */
  total: number | null;
}

export interface DailyRevenue {
  /** 表の列にする、つながった広告収益の媒体 */
  sources: AdSourceId[];
  /** 表に含めていない、まだつながっていない広告収益の媒体 */
  missing: AdSourceId[];
  /** 期間の毎日。新しい日が先 */
  rows: DailyRevenueRow[];
  totals: { values: (number | null)[]; total: number | null };
}

export interface AdOverview {
  range: DayRange;
  sources: AdSourceOverview[];
  dailyRevenue: DailyRevenue;
  kpis: {
    spend: Kpi;
    installs: Kpi;
    cpi: Kpi;
    adRevenue: Kpi;
    salesProceeds: Kpi;
    totalRevenue: Kpi;
    roas: Kpi;
    roi: Kpi;
  };
}

/** 広告費は SmaAD の広告出稿、インストール数は Tenjin から取る（CPI は両者の組み合わせ） */
export const SPEND_SOURCES: AdSourceId[] = ["smaad_spend"];
export const INSTALL_SOURCES: AdSourceId[] = ["tenjin"];
export const AD_REVENUE_SOURCES: AdSourceId[] = ["admob", "adgeneration", "smaad"];
export const SALES_SOURCES: AdSourceId[] = ["appstore", "googleplay"];

export function emptyTotals(): SourceTotals {
  return {
    ...(Object.fromEntries(AD_METRIC_KEYS.map((k) => [k, 0])) as AdMetrics),
    rows: 0,
  };
}

/** null を飛ばして足す。全部 null なら null */
function sumPresent(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, v) => a + v, 0);
}

/**
 * 広告収益を日付×媒体の表にする。列はつながった媒体だけ（KPI の広告収益と同じ扱い）。
 * 1日の合計は値のある媒体の分だけ足す。取り込み待ちの媒体はその列が「—」になるので、見ればわかる。
 */
export function buildDailyRevenue({
  sources,
  lastSuccess,
  range,
  daily,
}: {
  sources: readonly AdSource[];
  lastSuccess: ReadonlyMap<AdSourceId, Date>;
  range: DayRange;
  daily: readonly DailyValue[];
}): DailyRevenue {
  const joined = AD_REVENUE_SOURCES.filter((id) =>
    hasJoined(sources, lastSuccess, id, "revenue"),
  );
  const missing = AD_REVENUE_SOURCES.filter((id) => !joined.includes(id));

  const byKey = new Map<string, number>();
  for (const { source, date, value } of daily) {
    const key = `${source}|${date}`;
    byKey.set(key, (byKey.get(key) ?? 0) + value);
  }

  const rows = listDayKeys(range.from, range.to)
    .reverse()
    .map((date) => {
      const values = joined.map((id) => byKey.get(`${id}|${date}`) ?? null);
      return { date, values, total: sumPresent(values) };
    });
  const columnTotals = joined.map((_, i) => sumPresent(rows.map((r) => r.values[i])));

  return {
    sources: joined,
    missing,
    rows,
    totals: { values: columnTotals, total: sumPresent(columnTotals) },
  };
}

export function buildAdOverview({
  sources,
  env,
  range,
  totals,
  latestRuns,
  lastSuccess,
  dailyRevenue = [],
}: {
  sources: readonly AdSource[];
  env: Env;
  range: DayRange;
  totals: Map<AdSourceId, SourceTotals>;
  latestRuns: Map<AdSourceId, LatestRun>;
  lastSuccess: Map<AdSourceId, Date>;
  /** 広告収益の媒体×日の値 */
  dailyRevenue?: readonly DailyValue[];
}): AdOverview {
  const totalOf = (id: AdSourceId) => totals.get(id) ?? emptyTotals();
  const joins = (id: AdSourceId, metric: AdMetricKey) =>
    hasJoined(sources, lastSuccess, id, metric);
  /** 2つの指標の未接続を、媒体の並び順のままひとまとめにする */
  const missingOfBoth = (a: Kpi, b: Kpi) =>
    AD_SOURCE_IDS.filter((id) => a.missing.includes(id) || b.missing.includes(id));

  /** つながった媒体の分だけ足す。1つもつながっていなければ値なし */
  const sum = (ids: AdSourceId[], metric: AdMetricKey): Kpi => {
    const joined = ids.filter((id) => joins(id, metric));
    const missing = ids.filter((id) => !joined.includes(id));
    return {
      value:
        joined.length === 0
          ? null
          : joined.reduce((acc, id) => acc + totalOf(id)[metric], 0),
      missing,
    };
  };

  /** 必要な媒体がそろい、分母が0でないときだけ出す */
  const ratio = (
    numerator: Kpi,
    denominator: Kpi,
    fn: (n: number, d: number) => number,
  ): Kpi => {
    const missing = missingOfBoth(numerator, denominator);
    const n = numerator.value;
    const d = denominator.value;
    return {
      value:
        missing.length === 0 && n !== null && d !== null && d !== 0
          ? fn(n, d)
          : null,
      missing,
    };
  };

  const spend = sum(SPEND_SOURCES, "spend");
  const installs = sum(INSTALL_SOURCES, "installs");
  const adRevenue = sum(AD_REVENUE_SOURCES, "revenue");
  const salesProceeds = sum(SALES_SOURCES, "proceeds");
  const totalRevenue: Kpi = {
    value:
      adRevenue.value === null && salesProceeds.value === null
        ? null
        : (adRevenue.value ?? 0) + (salesProceeds.value ?? 0),
    missing: missingOfBoth(adRevenue, salesProceeds),
  };

  return {
    range,
    sources: sources.map((source) => {
      const latest = latestRuns.get(source.id);
      const success = lastSuccess.get(source.id);
      return {
        id: source.id,
        label: source.label,
        provides: source.provides,
        configured: missingEnv(source, env).length === 0,
        totals: totalOf(source.id),
        latestRun: latest
          ? { ...latest, finishedAt: latest.finishedAt.toISOString() }
          : null,
        lastSuccessAt: success ? success.toISOString() : null,
        pendingMetrics: [...(source.pendingMetrics ?? [])],
        csvImport: Boolean(source.parseCsv),
      };
    }),
    dailyRevenue: buildDailyRevenue({
      sources,
      lastSuccess,
      range,
      daily: dailyRevenue,
    }),
    kpis: {
      spend,
      installs,
      cpi: ratio(spend, installs, (n, d) => n / d),
      adRevenue,
      salesProceeds,
      totalRevenue,
      roas: ratio(totalRevenue, spend, (n, d) => n / d),
      roi: ratio(totalRevenue, spend, (n, d) => (n - d) / d),
    },
  };
}
