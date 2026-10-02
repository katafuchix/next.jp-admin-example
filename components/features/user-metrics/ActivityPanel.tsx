"use client";

import type { RetentionPoint } from "@/lib/user-metrics/compute";
import type { UserMetrics } from "@/lib/user-metrics/query";
import { formatNumber } from "@/lib/utils";
import { DauChart } from "./DauChart";
import { formatDayLabel, formatPercent } from "./format";
import { MetricTile, PanelError, PanelSkeleton, PeriodPicker } from "./parts";
import { RevenuePerUserTiles } from "./RevenuePerUserTiles";
import { usePeriod, useUserMetrics } from "./use-user-metrics";

const RETENTION_LABELS: Record<number, string> = {
  1: "翌日",
  7: "7日後",
  30: "30日後",
};

function RetentionRow({ point }: { point: RetentionPoint }) {
  const label = `${RETENTION_LABELS[point.day] ?? `${point.day}日後`}の継続率`;
  const width = point.rate === null ? 0 : Math.round(point.rate * 100);

  return (
    <div
      role="group"
      aria-label={label}
      className="py-3 border-b border-slate-100 last:border-0"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-slate-700">{label}</p>
        <p className="text-lg font-semibold text-slate-900 tabular-nums">
          {formatPercent(point.rate)}
        </p>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-100" aria-hidden="true">
        <div
          className="h-1.5 rounded-full bg-primary-500"
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {point.eligible === 0
          ? "まだ判定できる登録者がいません"
          : `${formatNumber(point.eligible)}人中${formatNumber(point.retained)}人`}
      </p>
    </div>
  );
}

function ActivityBody({ data }: { data: UserMetrics }) {
  const { activity, retention, paidRate, range } = data;
  const toLabel = formatDayLabel(range.to);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricTile
          label="平均DAU"
          value={activity.avgDau.toFixed(1)}
          note="期間の1日あたりの利用者数"
        />
        <MetricTile
          label="WAU"
          value={formatNumber(activity.wau)}
          note={`${toLabel}までの7日間`}
        />
        <MetricTile
          label="MAU"
          value={formatNumber(activity.mau)}
          note={`${toLabel}までの30日間`}
        />
        <MetricTile
          label="課金率（現在）"
          value={formatPercent(paidRate.overall.rate)}
          note={`期間内の登録者では ${formatPercent(paidRate.cohort.rate)}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 min-w-0">
          <h3 className="text-sm font-medium text-slate-700 mb-3">
            日別の利用者数（DAU）
          </h3>
          <div className="h-56" role="img" aria-label="日別の利用者数の推移">
            <DauChart data={activity.dau} />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-slate-700">継続率</h3>
          <p className="text-xs text-slate-500 mt-1 leading-snug">
            期間内に登録した人が、登録から N 日後にアプリを使った割合。N
            日たっていない人は含めません
          </p>
          <div className="mt-1">
            {retention.map((point) => (
              <RetentionRow key={point.day} point={point} />
            ))}
          </div>
        </div>
      </div>

      <RevenuePerUserTiles metrics={data} />
    </div>
  );
}

/** ダッシュボード: DAU / WAU / MAU・継続率・課金率・ARPU などを期間指定で見る */
export function ActivityPanel() {
  const [period, setPeriod] = usePeriod();
  const { data, loading, error } = useUserMetrics(period.from, period.to);

  return (
    <section
      aria-labelledby="activity-panel-title"
      aria-busy={loading}
      className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-5">
        <div>
          <h2
            id="activity-panel-title"
            className="text-base font-semibold text-slate-900"
          >
            利用状況
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            アプリのホーム表示・チャット送信があった日を「利用した日」として数えます
          </p>
        </div>
        <PeriodPicker from={period.from} to={period.to} onChange={setPeriod} />
      </div>

      {error ? (
        <PanelError message={error} />
      ) : loading || !data ? (
        <PanelSkeleton />
      ) : (
        <ActivityBody data={data} />
      )}
    </section>
  );
}
