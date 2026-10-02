import {
  AD_REVENUE_SOURCES,
  SALES_SOURCES,
  SPEND_SOURCES,
  type SourceTotals,
} from "@/lib/ad-sources/overview";
import { AD_SOURCES, findAdSource, hasJoined } from "@/lib/ad-sources/registry";
import type { AdMetricKey, AdSource, AdSourceId } from "@/lib/ad-sources/types";
import { jstDayKey } from "@/lib/jst-date";

/**
 * 収支分析の月別集計。広告データ画面と同じ取り込みデータ（AdDailyStat）を月ごとに足す。
 * 課金 = App Store・Google Play の手取り、広告収益 = AdMob・AdGeneration・SmaAD、広告費 = SmaAD の広告出稿。
 * 広告データ画面と同じく、一度も取り込めていない種類（まだ取り込んでいない指標も含む）は値なしにし、
 * 粗利は一部の媒体だけで引き算すると実態と違う赤字・黒字に見えるので、全媒体がそろうまで出さない。
 */

export interface MonthlySourceTotals {
  /** YYYY-MM（JST） */
  yearMonth: string;
  source: AdSourceId;
  totals: SourceTotals;
}

export interface RevenueFigures {
  /** 課金の手取り */
  chargeRevenue: number | null;
  adRevenue: number | null;
  /** 課金の手取り＋広告収益（つながった分だけ） */
  total: number | null;
  /** 広告費 */
  cost: number | null;
  /** 収益合計 − 広告費。全媒体がそろうまで値なし */
  profit: number | null;
}

export interface MonthlyRevenueRow extends RevenueFigures {
  yearMonth: string;
}

export interface SourceRef {
  id: AdSourceId;
  label: string;
}

export interface MonthlyRevenue {
  year: string;
  rows: MonthlyRevenueRow[];
  totals: RevenueFigures;
  /** 種類ごとの、まだつながっていない媒体（画面に名前を出す） */
  missing: { charge: SourceRef[]; ad: SourceRef[]; cost: SourceRef[] };
}

const GROUPS = {
  charge: { sources: SALES_SOURCES, metric: "proceeds" },
  ad: { sources: AD_REVENUE_SOURCES, metric: "revenue" },
  cost: { sources: SPEND_SOURCES, metric: "spend" },
} as const satisfies Record<
  string,
  { sources: AdSourceId[]; metric: AdMetricKey }
>;

type Group = keyof typeof GROUPS;

const YEAR_PATTERN = /^\d{4}$/;

/** 画面から来た年を検証する。省略時は JST の今年 */
export function resolveYear(
  param: string | null,
  now: Date,
): { ok: true; year: string } | { ok: false; error: string } {
  const year = param ?? jstDayKey(now).slice(0, 4);
  return YEAR_PATTERN.test(year)
    ? { ok: true, year }
    : { ok: false, error: "年は4桁の数字で指定してください" };
}

function addNullable(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

export function buildMonthlyRevenue({
  year,
  monthly,
  lastSuccess,
  sources = AD_SOURCES,
}: {
  year: string;
  monthly: readonly MonthlySourceTotals[];
  lastSuccess: ReadonlyMap<AdSourceId, Date>;
  sources?: readonly AdSource[];
}): MonthlyRevenue {
  const joins = (group: Group, id: AdSourceId) =>
    hasJoined(sources, lastSuccess, id, GROUPS[group].metric);
  const joined = (group: Group) =>
    GROUPS[group].sources.filter((id) => joins(group, id));
  const notJoined = (group: Group): SourceRef[] =>
    GROUPS[group].sources
      .filter((id) => !joins(group, id))
      .map((id) => ({ id, label: findAdSource(id, sources).label }));
  const missing = {
    charge: notJoined("charge"),
    ad: notJoined("ad"),
    cost: notJoined("cost"),
  };
  const complete = Object.values(missing).every((ids) => ids.length === 0);

  const inYear = monthly.filter((m) => m.yearMonth.startsWith(`${year}-`));
  const months = [...new Set(inYear.map((m) => m.yearMonth))].sort();

  /** 種類の中でつながった媒体の分だけ足す。1つもつながっていなければ値なし */
  const sumGroup = (items: readonly MonthlySourceTotals[], group: Group) => {
    const ids = joined(group);
    if (ids.length === 0) return null;
    const { metric } = GROUPS[group];
    return items
      .filter((m) => ids.includes(m.source))
      .reduce((acc, m) => acc + m.totals[metric], 0);
  };

  const figures = (items: readonly MonthlySourceTotals[]): RevenueFigures => {
    const chargeRevenue = sumGroup(items, "charge");
    const adRevenue = sumGroup(items, "ad");
    const total = addNullable(chargeRevenue, adRevenue);
    const cost = sumGroup(items, "cost");
    return {
      chargeRevenue,
      adRevenue,
      total,
      cost,
      profit: complete && total !== null && cost !== null ? total - cost : null,
    };
  };

  return {
    year,
    rows: months.map((yearMonth) => ({
      yearMonth,
      ...figures(inYear.filter((m) => m.yearMonth === yearMonth)),
    })),
    totals: figures(inYear),
    missing,
  };
}
