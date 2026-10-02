import type { MonthlyRevenue, RevenueFigures } from "@/lib/revenue-monthly";
import { formatMargin, formatYen, monthLabel } from "./format";

const HEADERS = [
  "月",
  "課金の手取り",
  "広告収益",
  "収益合計",
  "広告費",
  "粗利",
  "粗利率",
];

function profitClass(profit: number | null) {
  if (profit === null) return "text-slate-500";
  return profit >= 0 ? "text-emerald-600" : "text-red-500";
}

function FigureCells({ figures }: { figures: RevenueFigures }) {
  return (
    <>
      <td className="py-3 px-4 text-sm text-slate-700 tabular-nums">
        {formatYen(figures.chargeRevenue)}
      </td>
      <td className="py-3 px-4 text-sm text-slate-700 tabular-nums">
        {formatYen(figures.adRevenue)}
      </td>
      <td className="py-3 px-4 text-sm font-medium text-slate-900 tabular-nums">
        {formatYen(figures.total)}
      </td>
      <td className="py-3 px-4 text-sm text-slate-500 tabular-nums">
        {formatYen(figures.cost)}
      </td>
      <td
        className={`py-3 px-4 text-sm font-semibold tabular-nums ${profitClass(figures.profit)}`}
      >
        {formatYen(figures.profit)}
      </td>
      <td className="py-3 px-4 text-sm text-slate-600 tabular-nums">
        {formatMargin(figures)}
      </td>
    </>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      {HEADERS.map((h) => (
        <td key={h} className="py-3 px-4">
          <div className="animate-pulse bg-slate-200 rounded h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export function RevenueTable({ data }: { data: MonthlyRevenue | null }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-slate-200">
            {HEADERS.map((h) => (
              <th
                key={h}
                scope="col"
                className="text-left py-3 px-4 text-xs font-medium text-slate-500 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data === null ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
          ) : data.rows.length === 0 ? (
            <tr>
              <td
                colSpan={HEADERS.length}
                className="py-16 text-center text-sm text-slate-500"
              >
                この年のデータはまだありません
              </td>
            </tr>
          ) : (
            <>
              {data.rows.map((row) => (
                <tr
                  key={row.yearMonth}
                  className="border-b border-slate-100 last:border-0 hover:bg-gray-50 transition-colors"
                >
                  <td className="py-3 px-4 text-sm font-medium text-slate-900">
                    {monthLabel(row.yearMonth)}
                  </td>
                  <FigureCells figures={row} />
                </tr>
              ))}
              <tr className="bg-gray-50 border-t border-slate-200">
                <td className="py-3 px-4 text-sm font-semibold text-slate-900">
                  合計
                </td>
                <FigureCells figures={data.totals} />
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
