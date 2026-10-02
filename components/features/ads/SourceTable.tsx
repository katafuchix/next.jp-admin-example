import {
  CircleCheck,
  CircleMinus,
  CircleX,
  Clock,
  Unplug,
  type LucideIcon,
} from "lucide-react";
import type { AdSourceOverview } from "@/lib/ad-sources/overview";
import { cn } from "@/lib/utils";
import { CsvImportButton } from "./CsvImportButton";
import {
  lastSyncLabel,
  sourceState,
  sourceSummary,
  type SourceStateKind,
} from "./format";
import { groupSources } from "./source-groups";

const STATE_STYLE: Record<
  SourceStateKind,
  { icon: LucideIcon; badge: string; detail: string }
> = {
  ok: {
    icon: CircleCheck,
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    detail: "text-slate-600",
  },
  failed: {
    icon: CircleX,
    badge: "border-red-200 bg-red-50 text-red-700",
    detail: "text-red-700",
  },
  skipped: {
    icon: CircleMinus,
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    detail: "text-slate-600",
  },
  "never-synced": {
    icon: Clock,
    badge: "border-slate-200 bg-slate-50 text-slate-700",
    detail: "text-slate-600",
  },
  "not-configured": {
    icon: Unplug,
    badge: "border-dashed border-slate-300 bg-white text-slate-600",
    detail: "text-slate-600",
  },
};

const HEADERS = [
  { label: "媒体", className: "sm:w-1/2" },
  { label: "期間の実績", className: "sm:w-1/5" },
  { label: "最新の取り込み", className: "sm:w-[30%]" },
];

const CELL = "py-3 px-4 align-top max-sm:p-0";

function SourceRow({
  source,
  canImport,
  onImported,
}: {
  source: AdSourceOverview;
  canImport: boolean;
  onImported: () => void;
}) {
  const state = sourceState(source);
  const { icon: Icon, badge, detail } = STATE_STYLE[state.kind];
  const summary = sourceSummary(source);

  return (
    <tr
      role="row"
      className="border-t border-slate-100 max-sm:grid max-sm:gap-y-2 max-sm:px-4 max-sm:py-3"
    >
      <th
        role="rowheader"
        scope="row"
        className={cn(CELL, "text-left font-normal")}
      >
        <span className="block font-semibold text-slate-900">
          {source.label}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500 leading-snug">
          {source.provides}
        </span>
      </th>
      <td
        role="cell"
        className={cn(
          CELL,
          "max-sm:flex max-sm:flex-wrap max-sm:items-baseline max-sm:gap-x-2",
          summary === null && "max-sm:hidden",
        )}
      >
        {summary ? (
          <>
            <span className="block text-xs text-slate-500">
              {summary.label}
            </span>
            <span className="block text-base font-semibold text-slate-900 tabular-nums">
              {summary.value}
            </span>
            {summary.sub && (
              <span className="block text-xs text-slate-500 leading-snug">
                {summary.sub}
              </span>
            )}
          </>
        ) : (
          <span className="text-slate-500">—</span>
        )}
      </td>
      <td role="cell" className={CELL}>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
            badge,
          )}
        >
          <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          {state.label}
        </span>
        {source.latestRun && (
          <span className="mt-1 block text-xs text-slate-500 tabular-nums max-sm:ml-2 max-sm:mt-0 max-sm:inline-block">
            {lastSyncLabel(source)}
          </span>
        )}
        {state.detail && (
          <span className={cn("mt-1 block text-xs leading-snug", detail)}>
            {state.detail}
          </span>
        )}
        {canImport && source.csvImport && (
          <div className="mt-2">
            <CsvImportButton source={source} onImported={onImported} />
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * 媒体ごとの取り込み状況を、用途（広告費・広告収益・課金）ごとにまとめて出す。
 * 状態は色だけでなくアイコンと文言でも示す。CSV で取り込む媒体は、その行に取り込みボタンを置く。
 * スマホ幅では行をカードに組み替える。display を変えると表の役割が読み上げから落ちるブラウザがあるので、role を明示している。
 */
export function SourceTable({
  sources,
  canImport,
  onImported,
}: {
  sources: AdSourceOverview[];
  canImport: boolean;
  onImported: () => void;
}) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <table role="table" className="w-full text-sm max-sm:block">
        <thead role="rowgroup" className="max-sm:sr-only">
          <tr role="row">
            {HEADERS.map((h) => (
              <th
                key={h.label}
                role="columnheader"
                scope="col"
                className={cn(
                  "py-2 px-4 text-left text-xs font-medium text-slate-500 whitespace-nowrap",
                  h.className,
                )}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        {groupSources(sources).map((group) => (
          <tbody
            key={group.key}
            role="rowgroup"
            className="border-t border-slate-200 max-sm:block max-sm:first-of-type:border-t-0"
          >
            <tr role="row" className="max-sm:block">
              <th
                role="rowheader"
                scope="rowgroup"
                colSpan={3}
                className="bg-slate-50 py-2 px-4 text-left text-xs font-semibold text-slate-700 max-sm:block"
              >
                {group.label}
              </th>
            </tr>
            {group.sources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                canImport={canImport}
                onImported={onImported}
              />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
