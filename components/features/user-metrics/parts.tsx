"use client";

import { AlertCircle } from "lucide-react";
import { jstDayKey } from "@/lib/jst-date";
import { cn } from "@/lib/utils";
import { PRESET_DAYS, presetRange } from "./format";

const DATE_INPUT_CLASS =
  "h-10 min-w-0 flex-1 sm:flex-none px-3 text-base bg-white text-slate-900 border border-slate-500 rounded-lg hover:border-black";

interface Period {
  from: string;
  to: string;
}

/** 直近 N 日のボタンと、開始日・終了日の入力 */
export function PeriodPicker({
  from,
  to,
  onChange,
}: Period & { onChange: (period: Period) => void }) {
  const today = jstDayKey(new Date());

  return (
    <div className="flex flex-wrap items-center gap-2 leading-normal">
      <div role="group" aria-label="期間の選択" className="flex gap-1">
        {PRESET_DAYS.map((days) => {
          const preset = presetRange(days);
          const active = preset.from === from && preset.to === to;
          return (
            <button
              key={days}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(preset)}
              className={cn(
                "h-10 px-3 text-sm rounded-lg border transition-colors cursor-pointer",
                active
                  ? "border-primary-500 bg-primary-50 text-primary-700 font-semibold"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              直近{days}日
            </button>
          );
        })}
      </div>
      {/* スマホ幅では2つ並べると日付が欠けるので、ラベル付きで縦に積む */}
      <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:items-center">
        <DateField
          label="開始日"
          value={from}
          max={today}
          onChange={(value) => onChange({ from: value, to })}
        />
        <span className="hidden sm:inline text-slate-500" aria-hidden="true">
          〜
        </span>
        <DateField
          label="終了日"
          value={to}
          max={today}
          onChange={(value) => onChange({ from, to: value })}
        />
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: string;
  max: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-sm text-slate-600 sm:sr-only">
        {label}
      </span>
      <input
        type="date"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className={DATE_INPUT_CLASS}
      />
    </label>
  );
}

/** 数値1つと補足。role="group" と名前で読み上げ・テストから引ける */
export function MetricTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="rounded-lg bg-slate-50 p-3 sm:p-4"
    >
      <p className="text-xs font-medium text-slate-500 leading-tight">
        {label}
      </p>
      <p className="mt-2 text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
        {value}
      </p>
      {note && (
        <p className="mt-1 text-xs text-slate-500 leading-snug">{note}</p>
      )}
    </div>
  );
}

export function PanelError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg"
    >
      <AlertCircle
        className="w-4 h-4 mt-0.5 flex-shrink-0"
        aria-hidden="true"
      />
      <span className="text-sm">{message}</span>
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-slate-200 rounded-lg h-24" />
        ))}
      </div>
      <div className="animate-pulse bg-slate-200 rounded h-48" />
    </div>
  );
}
