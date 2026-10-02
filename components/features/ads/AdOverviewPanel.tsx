"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type { AdOverview } from "@/lib/ad-sources/overview";
import {
  PanelError,
  PanelSkeleton,
  PeriodPicker,
} from "@/components/features/user-metrics/parts";
import { usePeriod } from "@/components/features/user-metrics/use-user-metrics";
import { cn } from "@/lib/utils";
import { DailyRevenueTable } from "./DailyRevenueTable";
import { formatCount, formatRatio, formatYen, kpiNote } from "./format";
import { KpiTile } from "./KpiTile";
import { SourceTable } from "./SourceTable";
import { SyncButton } from "./SyncButton";
import { useAdOverview } from "./use-ad-overview";

type KpiKey = keyof AdOverview["kpis"];

/** 1行目は広告の効率、2行目は収益の内訳と回収 */
const KPIS: {
  key: KpiKey;
  label: string;
  format: (v: number | null) => string;
  formula: string;
}[] = [
  {
    key: "spend",
    label: "広告費",
    format: formatYen,
    formula: "SmaAD の広告出稿の利用金額（i-mobile など他の出稿先は含まない）",
  },
  {
    key: "installs",
    label: "インストール数",
    format: formatCount,
    formula: "Tenjin で計測したインストール",
  },
  {
    key: "cpi",
    label: "CPI",
    format: formatYen,
    formula: "広告費 ÷ インストール数",
  },
  {
    key: "roas",
    label: "ROAS",
    format: formatRatio,
    formula: "収益合計 ÷ 広告費",
  },
  {
    key: "adRevenue",
    label: "広告収益",
    format: formatYen,
    formula: "AdMob・AdGeneration・SmaAD の合計",
  },
  {
    key: "salesProceeds",
    label: "課金の手取り",
    format: formatYen,
    formula: "App Store・Google Play の手取り",
  },
  {
    key: "totalRevenue",
    label: "収益合計",
    format: formatYen,
    formula: "広告収益 ＋ 課金の手取り",
  },
  {
    key: "roi",
    label: "ROI",
    format: formatRatio,
    formula: "（収益合計 − 広告費）÷ 広告費",
  },
];

function KpiGrid({ overview }: { overview: AdOverview }) {
  const labels = new Map(overview.sources.map((s) => [s.id, s.label]));
  const nothingYet = overview.sources.every((s) => s.lastSuccessAt === null);

  return (
    <div className="space-y-4">
      {nothingYet && (
        <div className="flex items-start gap-2 p-4 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <p className="text-sm leading-relaxed">
            まだどの媒体からも取り込めていません。各媒体の認証情報を設定して同期すると、ここに実績が出ます。
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {KPIS.map(({ key, label, format, formula }) => {
          const kpi = overview.kpis[key];
          return (
            <KpiTile
              key={key}
              label={label}
              value={format(kpi.value)}
              note={kpiNote(kpi, labels, formula)}
            />
          );
        })}
      </div>
    </div>
  );
}

const CARD = "bg-white rounded-xl border border-slate-200 p-4 sm:p-6";

/**
 * 取り直しの間も直前の結果を出す（行の中の CSV 取り込みの結果メッセージを消さないため）。
 * 取得に失敗したときは出さない。
 */
function useKeptOverview(
  overview: AdOverview | null,
  loading: boolean,
): AdOverview | null {
  const [kept, setKept] = useState<AdOverview | null>(null);
  if (overview && overview !== kept) setKept(overview);
  return overview ?? (loading ? kept : null);
}

/**
 * 広告データ画面の本体。期間内の広告費・CPI・ROAS・ROI などと、日別・媒体別の広告収益、媒体ごとの取り込み状況。
 * 取り込めていない媒体がある指標は、値の代わりに何が足りないかを出す。
 */
export function AdOverviewPanel({ canSync }: { canSync: boolean }) {
  const [period, setPeriod] = usePeriod();
  const { data, loading, error, reload } = useAdOverview(
    period.from,
    period.to,
  );
  const shownSources = useKeptOverview(data, loading);

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="ad-kpi-heading"
        aria-busy={loading}
        className={CARD}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
          <h2
            id="ad-kpi-heading"
            className="text-base font-semibold text-slate-900"
          >
            広告の成果
          </h2>
          <PeriodPicker
            from={period.from}
            to={period.to}
            onChange={setPeriod}
          />
        </div>
        {error ? (
          <PanelError message={error} />
        ) : loading || !data ? (
          <PanelSkeleton />
        ) : (
          <KpiGrid overview={data} />
        )}
      </section>

      <section
        aria-labelledby="ad-daily-heading"
        aria-busy={loading}
        className={CARD}
      >
        <div className="mb-4">
          <h2
            id="ad-daily-heading"
            className="text-base font-semibold text-slate-900"
          >
            日別の広告収益
          </h2>
          <p className="mt-1 text-xs text-slate-500 leading-snug">
            上の期間の広告収益を、日付（日本時間）と媒体ごとに並べています。まだ取り込んでいない日は「—」です。
          </p>
        </div>
        {data ? (
          <DailyRevenueTable
            daily={data.dailyRevenue}
            labels={new Map(data.sources.map((s) => [s.id, s.label]))}
          />
        ) : loading ? (
          <div
            className="animate-pulse bg-slate-200 rounded h-40"
            aria-hidden="true"
          />
        ) : null}
      </section>

      <section
        aria-labelledby="ad-sources-heading"
        aria-busy={loading}
        className={CARD}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
          <div>
            <h2
              id="ad-sources-heading"
              className="text-base font-semibold text-slate-900"
            >
              媒体ごとの取り込み状況
            </h2>
            <p className="mt-1 text-xs text-slate-500 leading-snug">
              期間の実績は、取り込み済みの日次データを上の期間で合計したものです。最新の取り込みは、最後に同期（または CSV を取り込み）した結果です。
            </p>
          </div>
          {canSync && <SyncButton onSynced={reload} />}
        </div>
        {shownSources ? (
          <div className={cn("transition-opacity", loading && "opacity-60")}>
            <SourceTable
              sources={shownSources.sources}
              canImport={canSync}
              onImported={reload}
            />
          </div>
        ) : loading ? (
          <div
            className="animate-pulse bg-slate-200 rounded h-40"
            aria-hidden="true"
          />
        ) : null}
      </section>
    </div>
  );
}
