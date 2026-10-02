"use client";

import { useState } from "react";
import { TrendingUp, Download } from "lucide-react";
import { RevenueChart } from "@/components/features/dashboard/RevenueChart";
import { formatYen } from "@/components/features/revenue/format";
import { MissingSourcesNotice } from "@/components/features/revenue/MissingSourcesNotice";
import { RevenueTable } from "@/components/features/revenue/RevenueTable";
import {
  currentYear,
  useMonthlyRevenue,
  yearOptions,
} from "@/components/features/revenue/use-monthly-revenue";
import { PanelError } from "@/components/features/user-metrics/parts";
import type { MonthlyRevenue } from "@/lib/revenue-monthly";

function SummaryCards({
  data,
  year,
}: {
  data: MonthlyRevenue | null;
  year: string;
}) {
  const profit = data?.totals.profit ?? null;
  const cards = [
    { label: "課金の手取り", value: data?.totals.chargeRevenue ?? null },
    { label: "広告収益", value: data?.totals.adRevenue ?? null },
    { label: "広告費", value: data?.totals.cost ?? null },
    { label: "粗利", value: profit },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
      {cards.map((card) => (
        <div
          key={card.label}
          role="group"
          aria-label={card.label}
          className="bg-white rounded-xl border border-slate-200 p-5"
        >
          <p className="text-xs font-medium text-slate-500 mb-2">
            {card.label}
          </p>
          {data === null ? (
            <div className="animate-pulse bg-slate-200 rounded h-8 w-3/4" />
          ) : (
            <p
              className={`text-2xl font-bold tabular-nums ${
                card.label === "粗利" && profit !== null && profit < 0
                  ? "text-red-500"
                  : "text-slate-900"
              }`}
            >
              {formatYen(card.value)}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500">{year}年の合計</p>
        </div>
      ))}
    </div>
  );
}

export default function RevenuePage() {
  const [year, setYear] = useState(currentYear);
  const { data, error } = useMonthlyRevenue(year);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            収支分析
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            課金の手取り・広告収益・広告費を、取り込んだ媒体のデータから月ごとに集計します
          </p>
        </div>
        {/* エクスポート＋年セレクト */}
        <div className="flex items-center gap-3">
          <a
            href={`/admin/api/export?type=revenue&year=${year}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 h-10 px-4 text-sm sm:text-[1rem] font-bold bg-white text-primary-500 border border-current rounded-lg hover:bg-primary-200 hover:text-primary-700 hover:underline underline-offset-[3px] active:bg-primary-300"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            エクスポート
          </a>
          <div className="relative leading-normal">
            <select
              aria-label="対象の年"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="appearance-none pl-3 pr-10 py-2 text-base border border-slate-500 rounded-lg bg-white text-slate-900 cursor-pointer hover:border-black"
            >
              {yearOptions().map((y) => (
                <option key={y} value={y}>
                  {y}年
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </div>

      {error ? (
        <PanelError message={error} />
      ) : (
        <>
          {data && (
            <div className="mb-6">
              <MissingSourcesNotice missing={data.missing} />
            </div>
          )}

          <SummaryCards data={data} year={year} />

          {/* チャート */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 mb-6">
            <h2 className="text-base font-semibold text-slate-900 mb-4">
              収益推移
            </h2>
            <div className="h-48 sm:h-64">
              {data === null ? (
                <div className="animate-pulse bg-slate-200 rounded h-full" />
              ) : data.rows.length === 0 ? (
                <p className="h-full flex items-center justify-center text-sm text-slate-500">
                  この年のデータはまだありません
                </p>
              ) : (
                <RevenueChart rows={data.rows} />
              )}
            </div>
          </div>

          {/* 月次テーブル */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <TrendingUp
                  className="w-4 h-4 text-primary-500"
                  aria-hidden="true"
                />
                月次収支サマリー
              </h2>
            </div>
            <RevenueTable data={data} />
            <p className="px-4 sm:px-6 py-3 border-t border-slate-200 text-xs text-slate-500 leading-normal">
              粗利 = 課金の手取り（ストア手数料を引いた後）＋広告収益 −
              広告費。サーバー代・人件費などは含みません。
            </p>
          </div>
        </>
      )}
    </div>
  );
}
