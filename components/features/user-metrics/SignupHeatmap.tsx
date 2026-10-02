import type { CSSProperties } from "react";
import { WEEKDAY_LABELS } from "@/lib/user-metrics/compute";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const LEGEND_STEPS = [0.2, 0.4, 0.6, 0.8, 1];

/**
 * DADS Blue 800（#0031d8）の濃さで人数を表す。0人は背景だけ。
 * 文字色の切替点 0.71 は、どの濃さでも白・黒のどちらかが 4.5:1 以上になる値（計算で確認済み）
 */
function cellStyle(count: number, max: number): CSSProperties {
  if (count === 0) return { backgroundColor: "#f2f2f2" };
  const alpha = Number((0.12 + 0.88 * (count / max)).toFixed(2));
  return {
    backgroundColor: `rgba(0, 49, 216, ${alpha})`,
    color: alpha >= 0.71 ? "#ffffff" : "#000000",
  };
}

/** 登録した曜日（月〜日）× 時間帯（JST）の人数。セルに人数も書くので色だけに頼らない */
export function SignupHeatmap({ matrix }: { matrix: number[][] }) {
  const max = Math.max(0, ...matrix.flat());
  if (max === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-12">
        期間内の登録はありません
      </p>
    );
  }

  return (
    <div>
      {/* 狭い画面では表だけ横にスクロールさせ、ページは広げない */}
      <div className="relative overflow-x-auto [contain:inline-size]">
        <table className="border-separate border-spacing-0.5 text-[11px] tabular-nums">
          <caption className="sr-only">
            登録した曜日と時間帯（日本時間）ごとの人数
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">曜日</span>
              </th>
              {HOURS.map((h) => (
                <th
                  scope="col"
                  key={h}
                  className="w-7 font-normal text-slate-500"
                >
                  {h}
                </th>
              ))}
              <th
                scope="col"
                className="pl-2 font-medium text-slate-500 text-right"
              >
                計
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => {
              const weekday = WEEKDAY_LABELS[i];
              const total = row.reduce((sum, n) => sum + n, 0);
              return (
                <tr key={weekday}>
                  <th
                    scope="row"
                    className="pr-2 font-medium text-slate-600 text-left"
                  >
                    {weekday}
                  </th>
                  {row.map((count, h) => {
                    const label = `${weekday}曜 ${h}時台 ${count}人`;
                    return (
                      <td
                        key={h}
                        aria-label={label}
                        title={label}
                        className="h-7 w-7 min-w-7 rounded text-center"
                        style={cellStyle(count, max)}
                      >
                        {count > 0 ? count : ""}
                      </td>
                    );
                  })}
                  <td
                    aria-label={`${weekday}曜の合計 ${total}人`}
                    className="pl-2 text-right font-semibold text-slate-900"
                  >
                    {total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <div className="flex items-center gap-1" aria-hidden="true">
          <span>少</span>
          {LEGEND_STEPS.map((step) => (
            <span
              key={step}
              className="inline-block w-4 h-4 rounded"
              style={cellStyle(step, 1)}
            />
          ))}
          <span>多</span>
        </div>
        <span>数字は人数、横軸は時（日本時間）</span>
      </div>
    </div>
  );
}
