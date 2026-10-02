"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatYen, monthLabel } from "@/components/features/revenue/format";
import type { MonthlyRevenueRow } from "@/lib/revenue-monthly";
import { CHART } from "@/lib/chart-colors";

const formatAxis = (value: number) =>
  value >= 1000000
    ? `¥${(value / 1000000).toFixed(1)}M`
    : `¥${(value / 1000).toFixed(0)}K`;

/** 月別の課金の手取りと広告収益。まだつながっていない種類は線を引かない */
export function RevenueChart({ rows }: { rows: MonthlyRevenueRow[] }) {
  const data = rows.map((row) => ({
    month: monthLabel(row.yearMonth),
    課金: row.chargeRevenue,
    広告: row.adRevenue,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorCharge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART.blue} stopOpacity={0.15} />
            <stop offset="95%" stopColor={CHART.blue} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorAds" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART.green} stopOpacity={0.15} />
            <stop offset="95%" stopColor={CHART.green} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12, fill: CHART.axis }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatAxis}
          tick={{ fontSize: 11, fill: CHART.axis }}
          axisLine={false}
          tickLine={false}
          width={55}
        />
        <Tooltip
          formatter={(value) =>
            formatYen(
              value === null || value === undefined ? null : Number(value),
            )
          }
          contentStyle={{
            borderRadius: "8px",
            border: `1px solid ${CHART.tooltipBorder}`,
            fontSize: "12px",
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
        />
        <Area
          type="monotone"
          dataKey="課金"
          name="課金の手取り"
          stroke={CHART.blue}
          strokeWidth={2}
          fill="url(#colorCharge)"
        />
        <Area
          type="monotone"
          dataKey="広告"
          name="広告収益"
          stroke={CHART.green}
          strokeWidth={2}
          fill="url(#colorAds)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
