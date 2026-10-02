"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { CHART, CHART_TOOLTIP_STYLE } from "@/lib/chart-colors";

export interface GenderItem {
  gender: string;
  label: string;
  count: number;
}

const GENDER_COLORS: Record<string, string> = {
  male: CHART.blue,
  female: CHART.purple,
  other: CHART.gray,
  unknown: CHART.lightGray,
};

const FALLBACK_COLORS = [CHART.blue, CHART.purple, CHART.gray, CHART.lightGray];

const PERCENT = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });

function colorOf(item: GenderItem, index: number): string {
  return (
    GENDER_COLORS[item.gender] ??
    FALLBACK_COLORS[index % FALLBACK_COLORS.length]
  );
}

/**
 * 男女比率の円グラフ。人数と割合は円の外ではなく下の凡例に出す。
 * 円の外のラベルは「半径＋20px」の位置に描かれ、スライスが真上や左右に来ると
 * グラフの描画領域からはみ出して切れる（本番で「男性 2309」の上半分が欠けた）。
 */
export function GenderRatioChart({ items }: { items: GenderItem[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const visible = items
    .map((item, index) => ({ item, color: colorOf(item, index) }))
    .filter(({ item }) => item.count > 0);

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={items}
            dataKey="count"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={80}
          >
            {items.map((item, index) => (
              <Cell key={item.gender} fill={colorOf(item, index)} />
            ))}
          </Pie>
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      <ul
        aria-label="男女比率の内訳"
        className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-3"
      >
        {visible.map(({ item, color }) => (
          <li
            key={item.gender}
            className="flex items-center gap-1.5 text-sm text-slate-700"
          >
            <span
              aria-hidden="true"
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: color }}
            />
            {item.label}
            <span className="font-semibold text-slate-900 tabular-nums">
              {item.count.toLocaleString("ja-JP")}名
            </span>
            <span className="tabular-nums">
              （{PERCENT.format((item.count / total) * 100)}%）
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
