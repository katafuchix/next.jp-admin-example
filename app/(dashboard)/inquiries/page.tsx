"use client";

import { useState, useEffect } from "react";
import { Search, X, Clock, MessageSquare } from "lucide-react";

// ---- 型定義 ----
interface Inquiry {
  id: string;
  ticketId: string;
  userEmail: string;
  subject: string;
  category: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "waiting" | "resolved" | "closed";
  body: string;
  createdAt: string;
}

// ---- バッジ ----
const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-primary-100 text-primary-700",
  high: "bg-amber-100 text-amber-700",
  urgent: "bg-red-100 text-red-700",
};
const PRIORITY_LABEL: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "緊急",
};
const STATUS_BADGE: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  in_progress: "bg-primary-100 text-primary-700",
  waiting: "bg-amber-100 text-amber-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-100 text-slate-700",
};
const STATUS_LABEL: Record<string, string> = {
  open: "未対応",
  in_progress: "対応中",
  waiting: "保留",
  resolved: "解決済",
  closed: "クローズ",
};

const FILTER_TABS = [
  { key: "", label: "全て" },
  { key: "open", label: "未対応" },
  { key: "in_progress", label: "対応中" },
  { key: "waiting", label: "保留" },
  { key: "resolved", label: "解決済" },
];

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium ${PRIORITY_BADGE[priority] ?? "bg-slate-100 text-slate-700"}`}
    >
      {PRIORITY_LABEL[priority] ?? priority}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default function InquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page] = useState(1);

  // 詳細パネル
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [detailStatus, setDetailStatus] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [saving, setSaving] = useState(false);

  // 返信モーダル
  const [replyTarget, setReplyTarget] = useState<Inquiry | null>(null);
  const [replyModalBody, setReplyModalBody] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);

  // 一覧取得。返信のあとは version を進めて取り直す
  const [version, setVersion] = useState(0);
  const query = new URLSearchParams({
    status: statusFilter,
    search,
    page: String(page),
    limit: "20",
  }).toString();
  const key = `${query}#${version}`;
  // 今の条件の応答がまだ届いていなければ読み込み中
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== key;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/admin/api/inquiries?${query}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        setInquiries(Array.isArray(data) ? data : (data.data ?? []));
        setLoadedKey(key);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadedKey(key);
      });
    return () => controller.abort();
  }, [query, key]);

  // 行クリック → 詳細取得
  const openDetail = async (id: string) => {
    try {
      const r = await fetch(`/admin/api/inquiries/${id}`);
      const data = await r.json();
      const inq: Inquiry = data.data ?? data;
      setSelected(inq);
      setDetailStatus(inq.status);
      setReplyBody("");
    } catch {
      // silent
    }
  };

  // 返信送信
  const handleSubmit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await fetch(`/admin/api/inquiries/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: detailStatus,
          reply: replyBody ? { body: replyBody } : undefined,
        }),
      });
      // 一覧の該当行ステータスを楽観的更新
      setInquiries((prev) =>
        prev.map((inq) =>
          inq.id === selected.id
            ? { ...inq, status: detailStatus as Inquiry["status"] }
            : inq,
        ),
      );
      setSelected((prev) =>
        prev ? { ...prev, status: detailStatus as Inquiry["status"] } : prev,
      );
      setReplyBody("");
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  // 返信モーダル送信
  const handleReply = async () => {
    if (!replyTarget || !replyModalBody.trim()) return;
    setReplyLoading(true);
    try {
      const res = await fetch(`/api/inquiries/${replyTarget.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyModalBody.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setReplyTarget(null);
        setVersion((v) => v + 1);
      }
    } finally {
      setReplyLoading(false);
    }
  };

  const openCount = inquiries.filter((i) => i.status === "open").length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-10">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            問い合わせ対応
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            ユーザーからの問い合わせ一元管理
          </p>
        </div>
        {openCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm text-amber-600 font-medium bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 self-start sm:self-auto">
            <Clock className="w-4 h-4" />
            未対応 {openCount}件
          </span>
        )}
      </div>

      {/* フィルタタブ */}
      <div className="flex gap-1 mb-5 border-b border-slate-200 overflow-x-auto">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-3 sm:px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              statusFilter === tab.key
                ? "border-primary-500 text-primary-500"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 検索 */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="件名・メールで検索"
            className="w-full pl-9 pr-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 outline-none hover:border-black bg-white text-slate-900"
          />
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-gray-50">
                {[
                  "チケットID",
                  "件名",
                  "カテゴリ",
                  "優先度",
                  "ステータス",
                  "作成日",
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
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-16 text-center text-base text-slate-500"
                  >
                    読み込み中...
                  </td>
                </tr>
              ) : inquiries.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-16 text-center text-base text-slate-500"
                  >
                    該当する問い合わせはありません
                  </td>
                </tr>
              ) : (
                inquiries.map((inq) => (
                  <tr
                    key={inq.id}
                    onClick={() => openDetail(inq.id)}
                    className="border-b border-slate-100 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 text-xs font-mono text-slate-500">
                      {inq.ticketId ?? inq.id}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-slate-900">
                      {inq.subject}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500">
                      {inq.category ?? "-"}
                    </td>
                    <td className="py-3 px-4">
                      <PriorityBadge priority={inq.priority} />
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={inq.status} />
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {inq.createdAt}
                    </td>
                    <td
                      className="py-3 px-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          setReplyTarget(inq);
                          setReplyModalBody("");
                        }}
                        className="inline-flex items-center gap-1 h-8 px-3 text-xs font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer"
                      >
                        <MessageSquare className="w-3 h-3" />
                        返信
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 詳細パネル（右スライドイン） */}
      {selected && (
        <>
          {/* オーバーレイ */}
          <div
            className="fixed inset-0 bg-black/20 z-30"
            onClick={() => setSelected(null)}
          />
          {/* パネル */}
          <div className="fixed right-0 top-0 h-full w-full sm:w-[480px] bg-white border-l border-slate-200 shadow-xl z-40 p-4 sm:p-6 overflow-y-auto">
            {/* パネルヘッダー */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900">
                問い合わせ詳細
              </h2>
              <button
                onClick={() => setSelected(null)}
                aria-label="閉じる"
                className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {/* チケット情報 */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">チケットID</span>
                <span className="font-mono text-slate-700">
                  {selected.ticketId ?? selected.id}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">ユーザーEmail</span>
                <span className="text-slate-700">{selected.userEmail}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">カテゴリ</span>
                <span className="text-slate-700">
                  {selected.category ?? "-"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">優先度</span>
                <PriorityBadge priority={selected.priority} />
              </div>
            </div>

            {/* 件名・本文 */}
            <div className="mb-5">
              <p className="text-base font-medium text-slate-900 mb-2">
                {selected.subject}
              </p>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {selected.body}
              </p>
            </div>

            <div className="border-t border-slate-200 my-5" />

            {/* ステータス変更 */}
            <div className="mb-5 leading-normal">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                ステータス変更
              </label>
              <div className="relative">
                <select
                  value={detailStatus}
                  onChange={(e) => setDetailStatus(e.target.value)}
                  className="appearance-none w-full pl-3 pr-10 py-2 text-base border border-slate-500 rounded-lg outline-none bg-white text-slate-700 hover:border-black"
                >
                  {Object.entries(STATUS_LABEL).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
                <svg
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>

            {/* 返信欄 */}
            <div className="mb-5 leading-normal">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                返信内容
              </label>
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="ユーザーへの返信を入力..."
                rows={5}
                className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 outline-none resize-none hover:border-black bg-white text-slate-900"
              />
            </div>

            {/* 送信ボタン */}
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer disabled:bg-slate-300 disabled:text-slate-50 disabled:no-underline disabled:cursor-not-allowed w-full"
            >
              {saving ? "送信中..." : "返信送信"}
            </button>
          </div>
        </>
      )}

      {/* 返信モーダル */}
      {replyTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6 w-full max-w-lg shadow-md">
            <h3 className="text-base font-semibold text-slate-900 mb-1">
              返信
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {replyTarget.ticketId}: {replyTarget.subject}
            </p>
            <textarea
              className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg min-h-[120px] resize-y hover:border-black bg-white text-slate-900"
              placeholder="返信内容を入力..."
              value={replyModalBody}
              onChange={(e) => setReplyModalBody(e.target.value)}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setReplyTarget(null)}
                className="inline-flex items-center justify-center h-10 px-4 text-sm font-bold bg-white text-primary-500 border border-current rounded-lg hover:bg-primary-200 hover:text-primary-700 hover:underline underline-offset-[3px] active:bg-primary-300 cursor-pointer"
              >
                キャンセル
              </button>
              <button
                disabled={!replyModalBody.trim() || replyLoading}
                onClick={handleReply}
                className="inline-flex items-center justify-center h-10 px-4 text-sm font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer disabled:bg-slate-300 disabled:text-slate-50 disabled:no-underline"
              >
                {replyLoading ? "送信中..." : "送信"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
