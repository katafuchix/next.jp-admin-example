"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  User,
  CreditCard,
  History,
  Plus,
  Minus,
  CheckCircle,
  Trash2,
} from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { WRITE_ROLES, SUPER_ADMIN_ONLY } from "@/lib/roles";
import type { AdminRole } from "@/models/Admin";

interface CustomerDetail {
  id: string;
  email: string;
  name: string;
  status: "online" | "offline";
  plan: string;
  points: number;
  /** 課金額はアプリ側に記録が無いので常に null */
  totalCharge: number | null;
  purchaseCount: number;
  purchasePlatforms: ("ios" | "android")[];
  createdAt: string;
  lastLoginAt: string;
  loginStreakDays: number;
  deviceOs: string | null;
  appVersion: string | null;
  age: number | null;
  gender: string | null;
  height: number | null;
  residence: string | null;
  weight: number | null;
  bmi: number | null;
}

const PLATFORM_LABEL: Record<string, string> = {
  ios: "iOS",
  android: "Android",
};

function formatPurchases(count: number, platforms: string[]): string {
  if (count === 0) return "なし";
  const where = platforms.map((p) => PLATFORM_LABEL[p] ?? p).join("・");
  return where ? `${count}件（${where}）` : `${count}件`;
}

const GENDER_LABEL: Record<string, string> = {
  male: "男性",
  female: "女性",
  other: "その他",
};

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  online: "オンライン",
  offline: "オフライン",
};

const STATUS_CLASS: Record<string, string> = {
  online: "bg-emerald-100 text-emerald-700",
  offline: "bg-slate-100 text-slate-600",
};

const ACTIVITY_ICON: Record<string, string> = {
  login: "bg-slate-100 text-slate-500",
  point_add: "bg-emerald-100 text-emerald-600",
  point_use: "bg-amber-100 text-amber-600",
  purchase: "bg-primary-100 text-primary-600",
  register: "bg-violet-100 text-violet-600",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        STATUS_CLASS[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === "online" ? "bg-emerald-500" : "bg-slate-400"
        }`}
      />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-sm text-slate-900 font-medium text-right break-all">
        {value}
      </span>
    </div>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const session = useAppSession();
  const role = (session?.user as { role?: AdminRole })?.role;
  const canAdjustPoints = !!role && WRITE_ROLES.includes(role);
  const canDeleteCustomer = !!role && SUPER_ADMIN_ONLY.includes(role);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ポイント変更フォーム
  const [pointType, setPointType] = useState<"add" | "sub">("add");
  const [pointDelta, setPointDelta] = useState("");
  const [pointReason, setPointReason] = useState("");
  const [pointUpdating, setPointUpdating] = useState(false);
  const [pointError, setPointError] = useState<string | null>(null);
  const [pointSuccess, setPointSuccess] = useState<string | null>(null);

  // 顧客の削除
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 行動履歴
  const ACTIVITY_LIMIT = 20;
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activityPage, setActivityPage] = useState(1);
  const [activityTotal, setActivityTotal] = useState(0);

  useEffect(() => {
    const fetchCustomer = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/admin/api/customers/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "取得失敗");
        setCustomer(json.data);
      } catch (err) {
        console.error("[customer detail] fetch error:", err);
        setError("顧客データの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    fetchCustomer();
  }, [id]);

  useEffect(() => {
    const fetchActivities = async () => {
      setActivitiesLoading(true);
      try {
        const res = await fetch(
          `/admin/api/customers/${id}/activity?page=${activityPage}&limit=${ACTIVITY_LIMIT}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.success) {
          setActivities(json.data);
          setActivityTotal(json.meta?.total ?? json.data.length);
        }
      } catch {
        // silent
      } finally {
        setActivitiesLoading(false);
      }
    };
    fetchActivities();
  }, [id, activityPage]);

  const handlePointChange = async () => {
    const delta = parseInt(pointDelta, 10);
    if (isNaN(delta) || delta <= 0 || !pointReason.trim() || pointUpdating)
      return;
    setPointUpdating(true);
    setPointError(null);
    setPointSuccess(null);
    try {
      const res = await fetch(`/admin/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delta: pointType === "add" ? delta : -delta,
          reason: pointReason.trim(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "更新失敗");
      setCustomer((prev) =>
        prev ? { ...prev, points: json.data.newPoints } : prev,
      );
      setPointDelta("");
      setPointReason("");
      setPointSuccess(
        `${delta.toLocaleString("ja-JP")}pt を${pointType === "add" ? "加算" : "減算"}しました`,
      );
    } catch {
      setPointError("ポイントの更新に失敗しました");
    } finally {
      setPointUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!customer || deleting) return;
    if (
      !window.confirm(
        `「${customer.email}」を削除しますか？\nアカウントとアプリ内のデータは元に戻せません。`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/admin/api/customers/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "削除失敗");
      router.push("/customers");
    } catch {
      setDeleteError("顧客の削除に失敗しました");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-slate-200 rounded w-48" />
          <div className="h-48 bg-slate-200 rounded-xl" />
          <div className="h-48 bg-slate-200 rounded-xl" />
          <div className="h-32 bg-slate-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error && !customer) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg">
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  if (!customer) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-current bg-white text-primary-500 hover:bg-primary-200 hover:text-primary-700 cursor-pointer transition-colors"
          aria-label="戻る"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <p className="text-xs text-slate-500 font-mono mb-0.5">
            {customer.id}
          </p>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            {customer.name}
          </h1>
        </div>
        <div className="ml-2">
          <StatusBadge status={customer.status} />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg mb-6">
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div className="space-y-6">
        {/* 基本情報カード */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">基本情報</h2>
          </div>
          <InfoRow label="メールアドレス" value={customer.email} />
          <InfoRow
            label="ステータス"
            value={<StatusBadge status={customer.status} />}
          />
          <InfoRow label="プラン" value={customer.plan} />
          <InfoRow label="デバイスOS" value={customer.deviceOs ?? "—"} />
          <InfoRow label="アプリバージョン" value={customer.appVersion ?? "—"} />
          <InfoRow
            label="登録日"
            value={customer.createdAt ? customer.createdAt.slice(0, 10) : "—"}
          />
          <InfoRow
            label="最終ログイン"
            value={
              customer.lastLoginAt ? customer.lastLoginAt.slice(0, 10) : "—"
            }
          />
          <InfoRow
            label="連続ログイン日数"
            value={
              customer.loginStreakDays > 0
                ? `${customer.loginStreakDays}日`
                : "—"
            }
          />
          <InfoRow
            label="年齢"
            value={customer.age != null ? `${customer.age}歳` : "—"}
          />
          <InfoRow
            label="性別"
            value={
              customer.gender
                ? (GENDER_LABEL[customer.gender] ?? customer.gender)
                : "—"
            }
          />
          <InfoRow label="都道府県" value={customer.residence ?? "—"} />
          <InfoRow
            label="身長"
            value={customer.height != null ? `${customer.height}cm` : "—"}
          />
          <InfoRow
            label="体重"
            value={customer.weight != null ? `${customer.weight}kg` : "—"}
          />
          <InfoRow
            label="BMI"
            value={customer.bmi != null ? customer.bmi.toFixed(1) : "—"}
          />
        </div>

        {/* ポイント・課金カード */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-4 h-4 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">
              ポイント・課金
            </h2>
          </div>
          <InfoRow
            label="現在のポイント残高"
            value={
              <span className="text-primary-600 font-semibold">
                {customer.points.toLocaleString("ja-JP")} pt
              </span>
            }
          />
          <InfoRow
            label="累計課金額"
            value={
              customer.totalCharge != null
                ? `¥${customer.totalCharge.toLocaleString("ja-JP")}`
                : "—"
            }
          />
          <InfoRow
            label="課金の記録"
            value={formatPurchases(
              customer.purchaseCount,
              customer.purchasePlatforms,
            )}
          />
          <p className="mt-3 text-xs text-slate-500 leading-snug">
            課金額はアプリ側に記録されていないため出せません。課金の記録は、ストアでの購入がこの会員に紐づいた件数です。
          </p>
        </div>

        {/* ポイント手動変更カード */}
        {canAdjustPoints && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-4 h-4 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">
              ポイント手動変更
            </h2>
          </div>

          {pointSuccess && (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg mb-4">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{pointSuccess}</span>
            </div>
          )}
          {pointError && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg mb-4">
              <span className="text-sm">{pointError}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* 加算/減算切替 */}
            <div className="flex gap-2">
              <button
                onClick={() => setPointType("add")}
                className={`inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium rounded-lg border cursor-pointer transition-colors ${
                  pointType === "add"
                    ? "bg-emerald-50 border-emerald-400 text-emerald-700"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-gray-50"
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                加算
              </button>
              <button
                onClick={() => setPointType("sub")}
                className={`inline-flex items-center gap-1.5 h-9 px-4 text-sm font-medium rounded-lg border cursor-pointer transition-colors ${
                  pointType === "sub"
                    ? "bg-red-50 border-red-400 text-red-700"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-gray-50"
                }`}
              >
                <Minus className="w-3.5 h-3.5" />
                減算
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {/* ポイント数 */}
              <div className="leading-normal flex-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ポイント数
                </label>
                <input
                  type="number"
                  min="1"
                  value={pointDelta}
                  onChange={(e) => setPointDelta(e.target.value)}
                  placeholder="例: 500"
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 bg-white text-slate-900 hover:border-black"
                />
              </div>
              {/* 理由 */}
              <div className="leading-normal flex-[2]">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  理由（監査ログに記録されます）
                </label>
                <input
                  type="text"
                  value={pointReason}
                  onChange={(e) => setPointReason(e.target.value)}
                  placeholder="例: キャンペーン付与・誤付与の修正"
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 bg-white text-slate-900 hover:border-black"
                />
              </div>
            </div>

            <button
              onClick={handlePointChange}
              disabled={
                pointUpdating ||
                !pointDelta ||
                !pointReason.trim() ||
                parseInt(pointDelta, 10) <= 0
              }
              className={`inline-flex items-center justify-center gap-2 h-10 px-5 text-sm font-bold rounded-lg cursor-pointer transition-colors underline-offset-[3px] hover:underline disabled:bg-slate-300 disabled:text-slate-50 disabled:no-underline disabled:cursor-not-allowed w-full sm:w-auto ${
                pointType === "add"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800"
                  : "bg-red-500 text-white hover:bg-red-600 active:bg-red-700"
              }`}
            >
              {pointUpdating
                ? "処理中..."
                : pointType === "add"
                  ? "ポイントを加算する"
                  : "ポイントを減算する"}
            </button>
          </div>
        </div>
        )}

        {/* 行動履歴カード */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-900">行動履歴</h2>
          </div>

          {activitiesLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-slate-200 rounded w-3/4" />
                    <div className="h-3 bg-slate-200 rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : activities.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              行動履歴がありません
            </p>
          ) : (
            <div className="space-y-1">
              {activities.map((activity, index) => (
                <div key={activity.id} className="relative">
                  <div className="flex items-start gap-3 py-2.5">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                        ACTIVITY_ICON[activity.type] ??
                        "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {activity.type === "point_add"
                        ? "+"
                        : activity.type === "point_use"
                          ? "-"
                          : "•"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900">
                        {activity.description}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {new Date(activity.createdAt).toLocaleString("ja-JP", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  {index < activities.length - 1 && (
                    <div className="absolute left-4 top-[44px] w-px h-[calc(100%-8px)] bg-slate-100" />
                  )}
                </div>
              ))}
            </div>
          )}

          {!activitiesLoading && activityTotal > ACTIVITY_LIMIT && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
              <p className="text-sm text-slate-500">
                {activityTotal.toLocaleString("ja-JP")}件中{" "}
                {(activityPage - 1) * ACTIVITY_LIMIT + 1}–
                {Math.min(activityPage * ACTIVITY_LIMIT, activityTotal)}
                件を表示
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                  disabled={activityPage <= 1}
                  className="w-10 h-10 rounded-lg text-sm cursor-pointer transition-colors bg-white border border-current text-primary-500 hover:bg-primary-200 hover:text-primary-700 disabled:bg-white disabled:text-slate-300 disabled:cursor-not-allowed"
                >
                  ‹
                </button>
                <span className="w-10 h-10 inline-flex items-center justify-center text-sm bg-primary-500 text-white rounded-lg font-bold">
                  {activityPage}
                </span>
                <button
                  onClick={() =>
                    setActivityPage((p) =>
                      Math.min(
                        Math.ceil(activityTotal / ACTIVITY_LIMIT),
                        p + 1,
                      ),
                    )
                  }
                  disabled={activityPage >= Math.ceil(activityTotal / ACTIVITY_LIMIT)}
                  className="w-10 h-10 rounded-lg text-sm cursor-pointer transition-colors bg-white border border-current text-primary-500 hover:bg-primary-200 hover:text-primary-700 disabled:bg-white disabled:text-slate-300 disabled:cursor-not-allowed"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 顧客の削除カード */}
        {canDeleteCustomer && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Trash2 className="w-4 h-4 text-slate-500" />
              <h2 className="text-base font-semibold text-slate-900">
                顧客の削除
              </h2>
            </div>

            {deleteError && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg mb-4">
                <span className="text-sm">{deleteError}</span>
              </div>
            )}

            <p className="text-sm text-slate-600 mb-4">
              アカウントと、健康記録・チャット履歴などのアプリ内データを削除します。削除したデータは元に戻せません。削除後は、同じメールアドレスでアプリから新規登録できます。
            </p>

            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center justify-center gap-2 h-10 px-5 text-sm font-bold rounded-lg cursor-pointer transition-colors underline-offset-[3px] hover:underline disabled:bg-slate-300 disabled:text-slate-50 disabled:no-underline disabled:cursor-not-allowed w-full sm:w-auto bg-red-500 text-white hover:bg-red-600 active:bg-red-700"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? "削除中..." : "この顧客を削除する"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
