"use client";

import { useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import {
  currentYear,
  useMonthlyRevenue,
} from "@/components/features/revenue/use-monthly-revenue";
import { PanelError } from "@/components/features/user-metrics/parts";
import { RevenueChart } from "./RevenueChart";

/** ダッシュボード用。日本時間の今年の月別推移（収支分析と同じ集計） */
export function RevenueTrend() {
  const [year] = useState(currentYear);
  const { data, error } = useMonthlyRevenue(year);

  if (error) return <PanelError message={error} />;
  if (data === null) {
    return (
      <div
        className="animate-pulse bg-slate-200 rounded h-48 sm:h-64"
        aria-hidden="true"
      />
    );
  }

  const missingCount = Object.values(data.missing).flat().length;

  return (
    <div className="space-y-3">
      {missingCount > 0 && (
        <p
          role="status"
          className="flex items-start gap-2 text-xs text-slate-500 leading-normal"
        >
          <Info
            className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
            aria-hidden="true"
          />
          <span>
            まだ取り込めていない媒体（{missingCount}件）の分は含みません。
            <Link
              href="/revenue"
              className="ml-1 text-primary-500 underline underline-offset-2"
            >
              収支分析で確認
            </Link>
          </span>
        </p>
      )}
      <div className="h-48 sm:h-64">
        {data.rows.length === 0 ? (
          <p className="h-full flex items-center justify-center text-sm text-slate-500">
            今年のデータはまだありません
          </p>
        ) : (
          <RevenueChart rows={data.rows} />
        )}
      </div>
    </div>
  );
}
