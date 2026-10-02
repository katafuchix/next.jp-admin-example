"use client";

import Link from "next/link";
import type {
  AppPointStats,
  PointSourceRow,
  RecentPointLog,
} from "@/lib/app-points/query";
import { formatNumber, cn } from "@/lib/utils";
import { formatSyncedAt } from "@/components/features/ads/format";
import {
  MetricTile,
  PanelError,
  PanelSkeleton,
  PeriodPicker,
} from "@/components/features/user-metrics/parts";
import { usePeriod } from "@/components/features/user-metrics/use-user-metrics";
import { useAppPointStats } from "./use-app-point-stats";

const TH_CLASS =
  "py-2 px-3 text-left text-xs font-medium text-slate-500 whitespace-nowrap";
const TD_CLASS = "py-2 px-3 text-sm text-slate-700 whitespace-nowrap";
const NUM_CLASS = `${TD_CLASS} text-right tabular-nums`;

/** 付与・消費を色だけでなく文字でも示す */
function TypeBadge({ type }: { type: PointSourceRow["type"] }) {
  const earn = type === "earn";
  return (
    <span
      className={cn(
        "inline-block rounded border px-1.5 text-xs leading-5",
        earn
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-50 text-slate-700",
      )}
    >
      {earn ? "付与" : "消費"}
    </span>
  );
}

function signed(amount: number): string {
  return amount > 0 ? `+${formatNumber(amount)}` : formatNumber(amount);
}

function SourceTable({ rows }: { rows: PointSourceRow[] }) {
  return (
    <div className="overflow-x-auto min-w-0">
      <table aria-label="ポイントの内訳" className="min-w-full">
        <thead>
          <tr className="border-b border-slate-200">
            <th scope="col" className={TH_CLASS}>
              区分
            </th>
            <th scope="col" className={TH_CLASS}>
              内容
            </th>
            <th scope="col" className={`${TH_CLASS} text-right`}>
              件数
            </th>
            <th scope="col" className={`${TH_CLASS} text-right`}>
              ポイント
            </th>
            <th scope="col" className={`${TH_CLASS} text-right`}>
              人数
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={`${r.type}/${r.source}`}
              className="border-b border-slate-100"
            >
              <td className={TD_CLASS}>
                <TypeBadge type={r.type} />
              </td>
              <td className={TD_CLASS}>{r.label}</td>
              <td className={NUM_CLASS}>{formatNumber(r.count)}</td>
              <td className={NUM_CLASS}>
                {r.type === "spend"
                  ? formatNumber(-r.points)
                  : formatNumber(r.points)}
              </td>
              <td className={NUM_CLASS}>{formatNumber(r.users)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentTable({ rows }: { rows: RecentPointLog[] }) {
  return (
    <div className="overflow-x-auto min-w-0">
      <table aria-label="直近の記録" className="min-w-full">
        <thead>
          <tr className="border-b border-slate-200">
            <th scope="col" className={TH_CLASS}>
              日時
            </th>
            <th scope="col" className={TH_CLASS}>
              ユーザー
            </th>
            <th scope="col" className={TH_CLASS}>
              内容
            </th>
            <th scope="col" className={`${TH_CLASS} text-right`}>
              ポイント
            </th>
            <th scope="col" className={`${TH_CLASS} text-right`}>
              残高
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className={TD_CLASS}>{formatSyncedAt(r.createdAt)}</td>
              <td className={TD_CLASS}>
                <Link
                  href={`/customers/${r.userId}`}
                  className="text-primary-500 underline underline-offset-2"
                >
                  {r.userName}
                </Link>
              </td>
              <td className={TD_CLASS}>{r.label}</td>
              <td className={NUM_CLASS}>{signed(r.amount)}</td>
              <td className={NUM_CLASS}>{formatNumber(r.balanceAfter)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AppPointsBody({ data }: { data: AppPointStats }) {
  const { totals, balance, bySource, recent } = data;
  const empty = bySource.length === 0 && recent.length === 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricTile
          label="付与したポイント"
          value={formatNumber(totals.earned)}
          note={`${formatNumber(totals.earnCount)}件`}
        />
        <MetricTile
          label="使われたポイント"
          value={formatNumber(totals.spent)}
          note={`${formatNumber(totals.spendCount)}件`}
        />
        <MetricTile
          label="ポイントが動いた人数"
          value={formatNumber(totals.users)}
        />
        <MetricTile
          label="未使用のポイント残高"
          value={formatNumber(balance.total)}
          note={`残高のある人 ${formatNumber(balance.holders)}人・期間に関係なく今の値`}
        />
      </div>

      {empty ? (
        <p className="text-sm text-slate-500">
          この期間のポイントの記録はありません
        </p>
      ) : (
        <>
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">内訳</h3>
            <SourceTable rows={bySource} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">
              直近の記録（新しい順・最大50件）
            </h3>
            <RecentTable rows={recent} />
          </div>
        </>
      )}
    </div>
  );
}

/** アプリ（care）に記録されたポイントの付与・消費を期間指定で見る */
export function AppPointsPanel() {
  const [period, setPeriod] = usePeriod();
  const { data, loading, error } = useAppPointStats(period.from, period.to);

  return (
    <section
      aria-labelledby="app-points-panel-title"
      aria-busy={loading}
      className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 min-w-0"
    >
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-5">
        <div>
          <h2
            id="app-points-panel-title"
            className="text-base font-semibold text-slate-900"
          >
            アプリで実際に動いたポイント
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            アプリに記録されたポイントの付与と消費をそのまま集計しています
          </p>
        </div>
        <PeriodPicker from={period.from} to={period.to} onChange={setPeriod} />
      </div>

      {error ? (
        <PanelError message={error} />
      ) : loading || !data ? (
        <PanelSkeleton />
      ) : (
        <AppPointsBody data={data} />
      )}
    </section>
  );
}
