"use client";

import type { ReachSegment } from "@/lib/notification-reach";
import { formatNumber } from "@/lib/utils";
import { formatSyncedAt } from "@/components/features/ads/format";
import {
  MetricTile,
  PanelError,
} from "@/components/features/user-metrics/parts";
import { useNotificationReach } from "./use-notification-reach";

const SEGMENTS: { key: ReachSegment; label: string }[] = [
  { key: "all", label: "全体" },
  { key: "active", label: "アクティブ" },
  { key: "inactive", label: "非アクティブ" },
  { key: "premium", label: "プレミアム会員" },
];

/** 配信対象ごとに「いま送ったら何人に届くか」を、アプリの会員データから数えて出す */
export function ReachSummary() {
  const { data, loading, error } = useNotificationReach();

  return (
    <section
      aria-labelledby="reach-summary-heading"
      className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 mb-6"
    >
      <h2
        id="reach-summary-heading"
        className="text-base font-semibold text-slate-900"
      >
        いま送ると届く人数
      </h2>
      <p className="mt-1 text-xs text-slate-500 leading-snug">
        アプリで通知の受け取り先（端末）を登録している人の数です。アクティブは直近30日以内にアプリを開いた人です。
        {data && `（${formatSyncedAt(data.countedAt)} 時点）`}
      </p>

      <div className="mt-4">
        {loading && (
          <div
            className="grid grid-cols-2 lg:grid-cols-4 gap-3"
            aria-hidden="true"
          >
            {SEGMENTS.map((s) => (
              <div
                key={s.key}
                className="animate-pulse bg-slate-200 rounded-lg h-20"
              />
            ))}
          </div>
        )}
        {error && <PanelError message={error} />}
        {data && (
          <div className="space-y-3">
            {data.counts.all === 0 && (
              <PanelError message="通知を受け取れる端末が1件も登録されていないため、いま送っても誰にも届きません。" />
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {SEGMENTS.map((s) => (
                <MetricTile
                  key={s.key}
                  label={s.label}
                  value={`${formatNumber(data.counts[s.key])}名`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
