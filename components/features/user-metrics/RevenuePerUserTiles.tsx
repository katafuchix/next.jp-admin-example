"use client";

import { formatYenPerUser, kpiNote } from "@/components/features/ads/format";
import { KpiTile } from "@/components/features/ads/KpiTile";
import { useAdOverview } from "@/components/features/ads/use-ad-overview";
import type { UserMetrics } from "@/lib/user-metrics/query";
import {
  buildRevenuePerUser,
  type RevenuePerUser,
} from "@/lib/revenue-per-user";
import { PanelError } from "./parts";

const TILES: { key: keyof RevenuePerUser; label: string; formula: string }[] = [
  { key: "arpu", label: "ARPU", formula: "収益合計 ÷ 期間の利用者数" },
  {
    key: "arppu",
    label: "ARPPU",
    // 課金状態は今の状態しか残っていないので、期間の課金者数は数えられない
    formula: "課金の手取り ÷ 課金中の人数（現在）",
  },
  { key: "arpdau", label: "ARPDAU", formula: "収益合計 ÷ 延べ利用者数" },
];

/**
 * ダッシュボードの ARPU / ARPPU / ARPDAU。
 * 人数は利用状況（アプリDB）、収益は広告データ（管理画面DB）を同じ期間で取って組み合わせる。
 */
export function RevenuePerUserTiles({ metrics }: { metrics: UserMetrics }) {
  const { from, to } = metrics.range;
  const { data, loading, error } = useAdOverview(from, to);

  let body;
  if (error) {
    body = <PanelError message={error} />;
  } else if (loading || !data) {
    body = (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-hidden="true">
        {TILES.map(({ key }) => (
          <div
            key={key}
            className="animate-pulse bg-slate-200 rounded-lg h-24"
          />
        ))}
      </div>
    );
  } else {
    const labels = new Map(data.sources.map((s) => [s.id, s.label]));
    const values = buildRevenuePerUser({
      totalRevenue: data.kpis.totalRevenue,
      salesProceeds: data.kpis.salesProceeds,
      activity: metrics.activity,
      paidUsers: metrics.paidRate.overall.paid,
    });
    body = (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TILES.map(({ key, label, formula }) => (
          <KpiTile
            key={key}
            label={label}
            value={formatYenPerUser(values[key].value)}
            note={kpiNote(values[key], labels, formula)}
          />
        ))}
      </div>
    );
  }

  return (
    <div aria-busy={loading}>
      <h3 className="text-sm font-medium text-slate-700">
        ユーザーあたりの収益
      </h3>
      <p className="text-xs text-slate-500 mt-1 mb-3 leading-snug">
        収益は広告データ画面に取り込んだ広告収益と課金の手取りです。収益の媒体がすべてつながるまでは出しません
      </p>
      {body}
    </div>
  );
}
