import { auth } from "@/auth";
import {
  TrendingUp,
  Users,
  MessageSquare,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
  UserPlus,
} from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { RevenueTrend } from "@/components/features/dashboard/RevenueTrend";
import { ActivityPanel } from "@/components/features/user-metrics/ActivityPanel";
import { headers } from "next/headers";

async function fetchDashboard() {
  try {
    const hdrs = await headers();
    const host = hdrs.get("host") ?? "localhost:3000";
    const proto = process.env.NODE_ENV === "production" ? "https" : "http";
    const res = await fetch(`${proto}://${host}/admin/api/dashboard`, {
      cache: "no-store",
      headers: { cookie: hdrs.get("cookie") ?? "" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const session = await auth();
  const userName = session?.user?.name ?? "管理者";
  const data = await fetchDashboard();

  const kpiCards = [
    {
      label: "登録ユーザー数",
      value: data ? formatNumber(data.totalUsers) : "—",
      change: data ? `今日 +${data.newUsersToday}人` : "—",
      up: true,
      icon: Users,
      color: "text-primary-500",
      bg: "bg-primary-50",
    },
    {
      label: "今日の新規登録",
      value: data ? formatNumber(data.newUsersToday) : "—",
      change: "本日",
      up: true,
      icon: UserPlus,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "未送信通知",
      value: data ? formatNumber(data.pendingNotifications) : "—",
      change: "下書き・予約済み",
      up: false,
      icon: Bell,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      label: "未対応問い合わせ",
      value: data ? formatNumber(data.openInquiries) : "—",
      change: "オープン中",
      up: false,
      icon: MessageSquare,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  const recentActivities = [
    {
      type: "顧客",
      action: "顧客データ更新",
      user: `${data?.totalUsers ?? "—"}名登録中`,
      admin: "システム",
      time: "最新",
    },
    {
      type: "DB",
      action: "health-app 接続確認",
      user: "users / dashboardstats",
      admin: "システム",
      time: "起動時",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* ヘッダー */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          ダッシュボード
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          こんにちは、{userName}さん
        </p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {kpiCards.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-slate-500 leading-tight">
                {kpi.label}
              </p>
              <div
                className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center flex-shrink-0`}
              >
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-bold text-slate-900">
              {kpi.value}
            </p>
            <div className="flex items-center gap-1 mt-1">
              {kpi.up ? (
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              )}
              <span
                className={`text-xs font-medium ${
                  kpi.up ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {kpi.change} 先月比
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 利用状況（期間指定） */}
      <div className="mb-6 sm:mb-8">
        <ActivityPanel />
      </div>

      {/* チャート + アクティビティ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* 収益推移チャート */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h2 className="text-base font-semibold text-slate-900">収益推移</h2>
            <span className="text-xs text-slate-500">今年（月別）</span>
          </div>
          <RevenueTrend />
        </div>

        {/* 最近の操作 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            最近の操作
          </h2>
          <ul className="space-y-3">
            {recentActivities.map((activity, i) => (
              <li
                key={i}
                className="flex flex-col gap-0.5 py-2 border-b border-slate-100 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-primary-500 bg-primary-50 px-2 py-0.5 rounded-full">
                    {activity.type}
                  </span>
                  <span className="text-xs text-slate-500">
                    {activity.time}
                  </span>
                </div>
                <p className="text-sm text-slate-800 font-medium">
                  {activity.action}
                </p>
                <p className="text-xs text-slate-500">
                  {activity.user} · {activity.admin}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
