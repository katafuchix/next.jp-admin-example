import type { AdSyncStore } from "@/lib/ad-sync";
import type { MonthlySourceTotals } from "@/lib/revenue-monthly";
import { AdDailyStat } from "@/models/AdDailyStat";
import { AdSyncRun } from "@/models/AdSyncRun";
import {
  emptyTotals,
  type DailyValue,
  type LatestRun,
  type SourceTotals,
} from "./overview";
import {
  AD_METRIC_KEYS,
  type AdMetricKey,
  type AdMetrics,
  type AdSourceId,
  type DayRange,
} from "./types";

/** 管理画面DB（connectDB 済みの既定の接続）に保存する同期の保存先 */
export function createMongoAdSyncStore(): AdSyncStore {
  return {
    async upsertDaily(source, rows, fetchedAt) {
      if (rows.length === 0) return;
      await AdDailyStat.bulkWrite(
        rows.map((row) => ({
          updateOne: {
            filter: { source, date: row.date, key: row.key },
            update: {
              $set: {
                label: row.label ?? row.key,
                // 今回の取得に無い指標は0に戻す（前回の値を残さない）
                ...Object.fromEntries(
                  AD_METRIC_KEYS.map((k) => [k, row.metrics[k] ?? 0]),
                ),
                fetchedAt,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    },

    async removeStale(source, range, fetchedAt) {
      const result = await AdDailyStat.deleteMany({
        source,
        date: { $gte: range.from, $lte: range.to },
        fetchedAt: { $lt: fetchedAt },
      });
      return result.deletedCount;
    },

    async recordRun(run) {
      await AdSyncRun.create(run);
    },
  };
}

/** 期間内の媒体ごとの合計 */
export async function sumDailyBySource(
  range: DayRange,
): Promise<Map<AdSourceId, SourceTotals>> {
  const sums = Object.fromEntries(
    AD_METRIC_KEYS.map((key) => [key, { $sum: `$${key}` }]),
  );
  const docs = await AdDailyStat.aggregate<
    AdMetrics & { _id: AdSourceId; rows: number }
  >([
    { $match: { date: { $gte: range.from, $lte: range.to } } },
    { $group: { _id: "$source", ...sums, rows: { $sum: 1 } } },
  ]);
  return new Map(
    docs.map(({ _id, ...rest }) => [_id, { ...emptyTotals(), ...rest }]),
  );
}

/** 期間内の媒体×日ごとの、1つの指標の合計（指定した媒体だけ） */
export async function sumDailyBySourceAndDay(
  range: DayRange,
  sources: readonly AdSourceId[],
  metric: AdMetricKey,
): Promise<DailyValue[]> {
  const docs = await AdDailyStat.aggregate<{
    _id: { source: AdSourceId; date: string };
    value: number;
  }>([
    {
      $match: {
        date: { $gte: range.from, $lte: range.to },
        source: { $in: [...sources] },
      },
    },
    {
      $group: {
        _id: { source: "$source", date: "$date" },
        value: { $sum: `$${metric}` },
      },
    },
  ]);
  return docs.map(({ _id, value }) => ({ ..._id, value }));
}

/** 年（YYYY）の媒体×月ごとの合計。月は日付キー（JST）の先頭7文字 */
export async function sumMonthlyBySource(
  year: string,
): Promise<MonthlySourceTotals[]> {
  const sums = Object.fromEntries(
    AD_METRIC_KEYS.map((key) => [key, { $sum: `$${key}` }]),
  );
  const docs = await AdDailyStat.aggregate<
    AdMetrics & {
      _id: { source: AdSourceId; yearMonth: string };
      rows: number;
    }
  >([
    { $match: { date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } } },
    {
      $group: {
        _id: {
          source: "$source",
          yearMonth: { $substrBytes: ["$date", 0, 7] },
        },
        ...sums,
        rows: { $sum: 1 },
      },
    },
  ]);
  return docs.map(({ _id, ...rest }) => ({
    yearMonth: _id.yearMonth,
    source: _id.source,
    totals: { ...emptyTotals(), ...rest },
  }));
}

/** 媒体ごとの最新の同期と、最後に成功した日時 */
export async function fetchSyncStatus(): Promise<{
  latestRuns: Map<AdSourceId, LatestRun>;
  lastSuccess: Map<AdSourceId, Date>;
}> {
  const [latest, successes] = await Promise.all([
    AdSyncRun.aggregate<{ _id: AdSourceId; run: LatestRun }>([
      { $sort: { startedAt: -1 } },
      {
        $group: {
          _id: "$source",
          run: {
            $first: {
              status: "$status",
              trigger: "$trigger",
              rowCount: "$rowCount",
              message: "$message",
              finishedAt: "$finishedAt",
            },
          },
        },
      },
    ]),
    AdSyncRun.aggregate<{ _id: AdSourceId; at: Date }>([
      { $match: { status: "success" } },
      { $sort: { startedAt: -1 } },
      { $group: { _id: "$source", at: { $first: "$finishedAt" } } },
    ]),
  ]);
  return {
    latestRuns: new Map(latest.map((d) => [d._id, d.run])),
    lastSuccess: new Map(successes.map((d) => [d._id, d.at])),
  };
}
