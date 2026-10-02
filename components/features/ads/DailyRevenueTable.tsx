import { Info } from "lucide-react";
import type { DailyRevenue } from "@/lib/ad-sources/overview";
import type { AdSourceId } from "@/lib/ad-sources/types";
import { formatDayWithWeekday, formatYen } from "./format";

/*
 * 固定する見出しと合計の区切り線は、罫線ではなく inset の影で引く。
 * 表は border-collapse なので、罫線だとスクロールしたときにセルと一緒に動かず消える。
 */
const HEAD_CELL =
  "sticky top-0 z-10 bg-white py-2 px-3 text-xs font-medium text-slate-500 whitespace-nowrap shadow-[inset_0_-1px_0_var(--color-slate-200)]";
const FOOT_CELL =
  "sticky bottom-0 bg-slate-50 py-2 px-3 font-semibold text-slate-900 whitespace-nowrap shadow-[inset_0_1px_0_var(--color-slate-200)]";

/**
 * 日別・媒体別の広告収益。列はつながった媒体だけで、取り込んだ行が無い日は「—」（0円と区別する）。
 * 期間が長いと行が増えるので、表の中だけスクロールさせ、見出し・期間の合計・日付の列は固定する。
 */
export function DailyRevenueTable({
  daily,
  labels,
}: {
  daily: DailyRevenue;
  labels: ReadonlyMap<AdSourceId, string>;
}) {
  const nameOf = (ids: AdSourceId[]) =>
    ids.map((id) => labels.get(id) ?? id).join("・");

  if (daily.sources.length === 0) {
    return (
      <div className="flex items-start gap-2 p-4 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <p className="text-sm leading-relaxed">
          広告収益の媒体（{nameOf(daily.missing)}
          ）がまだつながっていません。同期すると日ごとの収益が出ます。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {daily.missing.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700">
          <Info className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          未接続: {nameOf(daily.missing)}（この表には含みません）
        </p>
      )}
      <div
        role="region"
        aria-label="日別の広告収益の表"
        tabIndex={0}
        className="relative max-h-96 overflow-auto [contain:inline-size] border border-slate-200 rounded-lg"
      >
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th scope="col" className={`${HEAD_CELL} left-0 z-20 text-left`}>
                日付
              </th>
              {daily.sources.map((id) => (
                <th key={id} scope="col" className={`${HEAD_CELL} text-right`}>
                  {labels.get(id) ?? id}
                </th>
              ))}
              <th scope="col" className={`${HEAD_CELL} text-right`}>
                合計
              </th>
            </tr>
          </thead>
          <tbody>
            {daily.rows.map((row) => (
              <tr
                key={row.date}
                className="border-b border-slate-100 last:border-0"
              >
                <th
                  scope="row"
                  className="sticky left-0 bg-white py-2 px-3 text-left font-normal text-slate-700 whitespace-nowrap tabular-nums"
                >
                  {formatDayWithWeekday(row.date)}
                </th>
                {row.values.map((value, i) => (
                  <td
                    key={daily.sources[i]}
                    className="py-2 px-3 text-right text-slate-900 whitespace-nowrap tabular-nums"
                  >
                    {formatYen(value)}
                  </td>
                ))}
                <td className="py-2 px-3 text-right font-medium text-slate-900 whitespace-nowrap tabular-nums">
                  {formatYen(row.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className={`${FOOT_CELL} left-0 z-20 text-left`}>
                期間の合計
              </th>
              {daily.totals.values.map((value, i) => (
                <td
                  key={daily.sources[i]}
                  className={`${FOOT_CELL} text-right tabular-nums`}
                >
                  {formatYen(value)}
                </td>
              ))}
              <td className={`${FOOT_CELL} text-right tabular-nums`}>
                {formatYen(daily.totals.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
