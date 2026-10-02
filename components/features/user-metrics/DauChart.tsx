"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyCount } from "@/lib/user-metrics/compute";
import { formatNumber } from "@/lib/utils";
import { formatDayLabel } from "./format";
import { CHART } from "@/lib/chart-colors";

const AXIS_TICK = { fontSize: 11, fill: CHART.axis };

function shortDay(key: string) {
  return `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
}

export function DauChart({ data }: { data: DailyCount[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={CHART.grid}
          vertical={false}
        />
        <XAxis
          dataKey="day"
          tickFormatter={shortDay}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          minTickGap={16}
        />
        <YAxis
          allowDecimals={false}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          labelFormatter={(label) => formatDayLabel(String(label))}
          formatter={(value) => [`${formatNumber(Number(value))}人`, "DAU"]}
          contentStyle={{
            borderRadius: "8px",
            border: `1px solid ${CHART.tooltipBorder}`,
            fontSize: "12px",
          }}
        />
        <Line
          type="monotone"
          dataKey="count"
          name="DAU"
          stroke={CHART.blue}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
