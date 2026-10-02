"use client";

import type { UserMetrics } from "@/lib/user-metrics/query";
import { formatNumber } from "@/lib/utils";
import { formatDayLabel } from "./format";
import { MetricTile, PanelError, PanelSkeleton, PeriodPicker } from "./parts";
import { SignupHeatmap } from "./SignupHeatmap";
import { usePeriod, useUserMetrics } from "./use-user-metrics";

/** 記録が1件も無いときは 0 と言い切らない（記録を始める前の退会は数えられない） */
function WithdrawalTile({
  withdrawals,
}: {
  withdrawals: UserMetrics["users"]["withdrawals"];
}) {
  const { total, fromApp, fromAdmin, recordedSince } = withdrawals;
  if (!recordedSince) {
    return (
      <MetricTile
        label="退会ユーザー数"
        value="—"
        note="まだ退会の記録がありません"
      />
    );
  }
  return (
    <MetricTile
      label="退会ユーザー数"
      value={formatNumber(total)}
      note={`アプリ ${formatNumber(fromApp)}・管理画面 ${formatNumber(fromAdmin)}／最初の記録 ${formatDayLabel(recordedSince)}`}
    />
  );
}

function RegistrationBody({ data }: { data: UserMetrics }) {
  const { users, activity, range } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricTile
          label="総ユーザー数"
          value={formatNumber(users.total)}
          note={`${formatDayLabel(range.to)}時点（退会済みを除く）`}
        />
        <MetricTile
          label="新規ユーザー数"
          value={formatNumber(users.newUsers)}
          note="期間内に登録した人数"
        />
        <WithdrawalTile withdrawals={users.withdrawals} />
        <MetricTile
          label="総ログイン数"
          value={formatNumber(activity.totalLogins)}
          note={`1人1日1回の延べ数・利用者 ${formatNumber(activity.activeUsers)}人`}
        />
      </div>

      <div>
        <h3 className="text-sm font-medium text-slate-700 mb-3">
          登録の曜日・時間帯
        </h3>
        <SignupHeatmap matrix={users.signupHeatmap} />
      </div>
    </div>
  );
}

/** 顧客分析: 総ユーザー・新規・退会・総ログイン数・登録曜日×時間帯を期間指定で見る */
export function RegistrationPanel() {
  const [period, setPeriod] = usePeriod();
  const { data, loading, error } = useUserMetrics(period.from, period.to);

  return (
    <section
      aria-labelledby="registration-panel-title"
      aria-busy={loading}
      className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6"
    >
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-5">
        <div>
          <h2
            id="registration-panel-title"
            className="text-base font-semibold text-slate-900"
          >
            登録と利用
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            集計期間ごとの登録数・利用回数と、登録が多い曜日・時間帯
          </p>
        </div>
        <PeriodPicker from={period.from} to={period.to} onChange={setPeriod} />
      </div>

      {error ? (
        <PanelError message={error} />
      ) : loading || !data ? (
        <PanelSkeleton />
      ) : (
        <RegistrationBody data={data} />
      )}
    </section>
  );
}
