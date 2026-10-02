"use client";

import { AdOverviewPanel } from "@/components/features/ads/AdOverviewPanel";
import { useAppSession } from "@/app/session-context";
import { WRITE_ROLES } from "@/lib/roles";
import type { AdminRole } from "@/models/Admin";

export default function AdsPage() {
  const session = useAppSession();
  const role = (session?.user as { role?: AdminRole })?.role;
  const canSync = !!role && WRITE_ROLES.includes(role);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          広告データ管理
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Tenjin・SmaAD・広告ネットワーク・アプリストアから取り込んだ日次データを、期間を指定して集計します
        </p>
      </div>
      <AdOverviewPanel canSync={canSync} />
    </div>
  );
}
