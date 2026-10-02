import type { Kpi } from "@/lib/ad-sources/overview";

/**
 * ユーザーあたりの収益（ARPU / ARPPU / ARPDAU）。
 * 収益は広告データ（管理画面DB）、人数はアプリの利用記録（アプリDB）から来るので、
 * 同じ期間で取った2つを画面側で組み合わせる。
 * ROAS と同じく、必要な媒体がそろうまでは一部の合計で割らずに値なしにする。
 */
export interface RevenuePerUser {
  /** 収益合計 ÷ 期間中に1日でも使ったユーザー数 */
  arpu: Kpi;
  /** 課金の手取り ÷ 課金ユーザー数 */
  arppu: Kpi;
  /** 収益合計 ÷ 延べ利用者数（DAU の合計）。期間の1日あたり収益 ÷ 平均DAU と同じ */
  arpdau: Kpi;
}

function perUser(revenue: Kpi, users: number): Kpi {
  return {
    value:
      revenue.missing.length === 0 && revenue.value !== null && users > 0
        ? revenue.value / users
        : null,
    missing: revenue.missing,
  };
}

export function buildRevenuePerUser({
  totalRevenue,
  salesProceeds,
  activity,
  paidUsers,
}: {
  totalRevenue: Kpi;
  salesProceeds: Kpi;
  activity: { activeUsers: number; totalLogins: number };
  paidUsers: number;
}): RevenuePerUser {
  return {
    arpu: perUser(totalRevenue, activity.activeUsers),
    arppu: perUser(salesProceeds, paidUsers),
    arpdau: perUser(totalRevenue, activity.totalLogins),
  };
}
