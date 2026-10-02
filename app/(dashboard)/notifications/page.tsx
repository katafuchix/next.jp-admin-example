"use client";

import { useState, useEffect } from "react";
import { Bell, Plus, X, Send, Pencil, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { PanelError } from "@/components/features/user-metrics/parts";
import { ReachSummary } from "@/components/features/notifications/ReachSummary";

type NotificationStatus = "draft" | "scheduled" | "sent" | "failed";
type TargetSegment = "all" | "active" | "inactive" | "premium";
type ScheduleType = "immediate" | "once" | "recurring";

type Recurrence = {
  daysOfWeek: number[];
  time: string;
};

type Notification = {
  id: string;
  title: string;
  body?: string;
  targetSegment: TargetSegment;
  status: NotificationStatus;
  scheduleType: ScheduleType;
  enabled: boolean;
  recurrence: Recurrence | null;
  scheduledAt: string | null;
  lastDispatchedAt: string | null;
  reachCount: number;
};

const STATUS_LABEL: Record<NotificationStatus, string> = {
  draft: "下書き",
  scheduled: "スケジュール済",
  sent: "配信済",
  failed: "失敗",
};

const STATUS_BADGE: Record<NotificationStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  scheduled: "bg-primary-100 text-primary-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

const SEGMENT_LABEL: Record<TargetSegment, string> = {
  all: "全体",
  active: "アクティブ",
  inactive: "非アクティブ",
  premium: "プレミアム会員",
};

const SCHEDULE_TYPE_LABEL: Record<ScheduleType, string> = {
  immediate: "今すぐ配信(手動)",
  once: "単発予約",
  recurring: "繰り返し配信",
};

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "", label: "全て" },
  { key: "draft", label: "下書き" },
  { key: "scheduled", label: "スケジュール済" },
  { key: "sent", label: "配信済" },
];

type FormState = {
  title: string;
  body: string;
  targetSegment: TargetSegment;
  scheduleType: ScheduleType;
  scheduledAt: string;
  recurrence: Recurrence;
  enabled: boolean;
};

const INITIAL_FORM: FormState = {
  title: "",
  body: "",
  targetSegment: "all",
  scheduleType: "immediate",
  scheduledAt: "",
  recurrence: { daysOfWeek: [], time: "18:00" },
  enabled: true,
};

function toFormState(n: Notification): FormState {
  return {
    title: n.title,
    body: n.body ?? "",
    targetSegment: n.targetSegment,
    scheduleType: n.scheduleType,
    scheduledAt: n.scheduledAt ? n.scheduledAt.slice(0, 16) : "",
    recurrence: n.recurrence ?? { daysOfWeek: [], time: "18:00" },
    enabled: n.enabled,
  };
}

function scheduleSummary(n: Notification): string {
  if (n.scheduleType === "immediate") return "手動配信";
  if (n.scheduleType === "once") {
    return n.scheduledAt ? formatDateTime(n.scheduledAt) : "-";
  }
  if (!n.recurrence?.daysOfWeek?.length) return "-";
  const days = [...n.recurrence.daysOfWeek]
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d])
    .join("・");
  return `毎週 ${days} ${n.recurrence.time}`;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("");
  const [page] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function fetchNotifications() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
        ...(activeTab ? { status: activeTab } : {}),
      });
      const res = await fetch(`/admin/api/notifications?${params}`);
      const json = await res.json();
      if (!json.success) {
        setListError(json.error ?? "通知の一覧を読み込めませんでした");
        setNotifications([]);
        return;
      }
      setListError(null);
      setNotifications(Array.isArray(json.data) ? json.data : []);
    } catch {
      setListError("通知の一覧を読み込めませんでした");
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setError(null);
    setShowModal(true);
  }

  function openEdit(n: Notification) {
    setEditingId(n.id);
    setForm(toFormState(n));
    setError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(INITIAL_FORM);
    setError(null);
  }

  function toggleDay(day: number) {
    setForm((prev) => {
      const has = prev.recurrence.daysOfWeek.includes(day);
      const daysOfWeek = has
        ? prev.recurrence.daysOfWeek.filter((d) => d !== day)
        : [...prev.recurrence.daysOfWeek, day];
      return { ...prev, recurrence: { ...prev.recurrence, daysOfWeek } };
    });
  }

  async function handleSubmit() {
    if (!form.title) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        body: form.body,
        targetSegment: form.targetSegment,
        scheduleType: form.scheduleType,
        enabled: form.enabled,
      };
      if (form.scheduleType === "once") {
        payload.scheduledAt = form.scheduledAt || null;
      }
      if (form.scheduleType === "recurring") {
        payload.recurrence = form.recurrence;
      }

      const res = editingId
        ? await fetch(`/admin/api/notifications/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/admin/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, status: "draft" }),
          });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "保存に失敗しました");
        return;
      }
      await fetchNotifications();
      closeModal();
    } catch {
      setError("保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSend(id: string) {
    if (sendingId) return;
    setSendingId(id);
    setSendError(null);
    try {
      const res = await fetch(`/admin/api/notifications/${id}/send`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.success) {
        setSendError(`配信できませんでした: ${json.error ?? "原因不明のエラー"}`);
        return;
      }
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id
            ? {
                ...n,
                status: "sent" as const,
                reachCount: json.totalTargets ?? n.reachCount,
              }
            : n,
        ),
      );
    } catch {
      setSendError("配信できませんでした。通信を確認してもう一度お試しください。");
    } finally {
      setSendingId(null);
    }
  }

  async function handleToggleEnabled(n: Notification) {
    const nextEnabled = !n.enabled;
    setNotifications((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, enabled: nextEnabled } : item)),
    );
    try {
      const res = await fetch(`/admin/api/notifications/${n.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    } catch {
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, enabled: n.enabled } : item)),
      );
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    if (!window.confirm("この通知設定を削除しますか？予約・繰り返し配信は停止されます。")) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/admin/api/notifications/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }
    } catch {
      // no-op
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">通知管理</h1>
          <p className="text-sm text-slate-500 mt-1">
            プッシュ通知の作成・予約・繰り返し配信・配信管理
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          通知作成
        </button>
      </div>

      <ReachSummary />

      {/* ステータスタブ */}
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            aria-pressed={activeTab === tab.key}
            className={`px-4 py-3 text-sm border-b-2 cursor-pointer transition-colors ${
              activeTab === tab.key
                ? "font-semibold text-primary-500 border-primary-500"
                : "font-medium text-slate-500 border-transparent hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {sendError && (
        <div className="mb-4">
          <PanelError message={sendError} />
        </div>
      )}

      {/* テーブル */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-gray-50">
              {[
                "タイトル",
                "対象",
                "配信方法",
                "配信タイミング",
                "ステータス",
                "有効",
                "配信数",
                "開封率",
                "操作",
              ].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="py-3 px-4">
                        <div className="animate-pulse bg-slate-200 rounded h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : notifications.map((n) => (
                  <tr
                    key={n.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-slate-900">
                          {n.title}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500">
                      {SEGMENT_LABEL[n.targetSegment] ?? n.targetSegment}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500">
                      {SCHEDULE_TYPE_LABEL[n.scheduleType] ?? n.scheduleType}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap">
                      {scheduleSummary(n)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[n.status] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {STATUS_LABEL[n.status] ?? n.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {n.scheduleType === "immediate" ? (
                        <span className="text-sm text-slate-500">-</span>
                      ) : (
                        <button
                          onClick={() => handleToggleEnabled(n)}
                          className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                            n.enabled
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                          }`}
                        >
                          {n.enabled ? "有効" : "無効"}
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700 whitespace-nowrap">
                      {n.status === "sent" || n.lastDispatchedAt
                        ? n.reachCount.toLocaleString("ja-JP") + " 名"
                        : "-"}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500">
                      <span title="開封は記録していないため計算できません">
                        —
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {n.scheduleType === "immediate" &&
                          (n.status === "draft" || n.status === "scheduled") && (
                            <button
                              onClick={() => handleSend(n.id)}
                              disabled={sendingId === n.id}
                              className="inline-flex items-center gap-1.5 h-8 px-3 text-sm font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer disabled:bg-slate-300 disabled:text-slate-50 disabled:no-underline disabled:cursor-not-allowed transition-colors"
                            >
                              <Send className="w-3.5 h-3.5" />
                              {sendingId === n.id ? "配信中..." : "配信"}
                            </button>
                          )}
                        <button
                          onClick={() => openEdit(n)}
                          className="w-8 h-8 inline-flex items-center justify-center cursor-pointer text-slate-500 hover:text-slate-700 rounded-lg hover:bg-gray-100"
                          aria-label="編集"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(n.id)}
                          disabled={deletingId === n.id}
                          className="w-8 h-8 inline-flex items-center justify-center cursor-pointer text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50 active:bg-red-100 disabled:text-slate-300 disabled:cursor-not-allowed"
                          aria-label="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!loading && listError && (
          <div className="p-4">
            <PanelError message={listError} />
          </div>
        )}
        {!loading && !listError && notifications.length === 0 && (
          <p className="text-base text-slate-500 text-center py-16">
            通知がありません
          </p>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500 leading-snug">
        配信数は、送った時点で通知を受け取れる端末を登録していた人数です（繰り返し配信は直近の回）。開封は記録していないため、開封率は出せません。
      </p>

      {/* モーダル */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-md shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">
                {editingId ? "通知を編集" : "通知作成"}
              </h2>
              <button
                onClick={closeModal}
                className="w-8 h-8 inline-flex items-center justify-center cursor-pointer text-slate-500 hover:text-slate-700 rounded-lg hover:bg-gray-100"
                aria-label="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="leading-normal">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  タイトル
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="例: 6月キャンペーン開始！"
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                />
              </div>
              <div className="leading-normal">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  本文
                </label>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder="通知の本文を入力してください"
                  rows={3}
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 resize-none hover:border-black bg-white text-slate-900"
                />
              </div>
              <div className="leading-normal">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  配信対象
                </label>
                <div className="relative">
                  <select
                    value={form.targetSegment}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        targetSegment: e.target.value as TargetSegment,
                      })
                    }
                    className="appearance-none w-full pl-3 pr-10 py-2 text-base border border-slate-500 rounded-lg hover:border-black bg-white text-slate-900"
                  >
                    <option value="all">全体</option>
                    <option value="active">アクティブ</option>
                    <option value="inactive">非アクティブ</option>
                    <option value="premium">プレミアム会員</option>
                  </select>
                  <svg
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
              <div className="leading-normal">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  配信方法
                </label>
                <div className="relative">
                  <select
                    value={form.scheduleType}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        scheduleType: e.target.value as ScheduleType,
                      })
                    }
                    className="appearance-none w-full pl-3 pr-10 py-2 text-base border border-slate-500 rounded-lg hover:border-black bg-white text-slate-900"
                  >
                    <option value="immediate">今すぐ配信(手動)</option>
                    <option value="once">単発予約</option>
                    <option value="recurring">繰り返し配信</option>
                  </select>
                  <svg
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>

              {form.scheduleType === "once" && (
                <div className="leading-normal">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    配信日時
                  </label>
                  <input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) =>
                      setForm({ ...form, scheduledAt: e.target.value })
                    }
                    className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                  />
                </div>
              )}

              {form.scheduleType === "recurring" && (
                <div className="leading-normal space-y-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    繰り返す曜日
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DAY_LABELS.map((label, day) => {
                      const active = form.recurrence.daysOfWeek.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`w-9 h-9 rounded-full text-sm font-medium cursor-pointer transition-colors ${
                            active
                              ? "bg-primary-500 text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <label className="block text-sm font-medium text-slate-700 mb-1 pt-2">
                    配信時刻
                  </label>
                  <input
                    type="time"
                    value={form.recurrence.time}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        recurrence: { ...form.recurrence, time: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                  />
                </div>
              )}

              {form.scheduleType !== "immediate" && (
                <div className="leading-normal flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">有効</span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, enabled: !form.enabled })}
                    className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                      form.enabled
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {form.enabled ? "有効" : "無効"}
                  </button>
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-6">
              <button
                onClick={closeModal}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-white text-primary-500 border border-current rounded-lg hover:bg-primary-200 hover:text-primary-700 hover:underline underline-offset-[3px] active:bg-primary-300 cursor-pointer w-full sm:w-auto"
              >
                キャンセル
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !form.title}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer disabled:bg-slate-300 disabled:text-slate-50 disabled:no-underline disabled:cursor-not-allowed w-full sm:w-auto"
              >
                {submitting ? "保存中..." : editingId ? "更新" : "作成"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
