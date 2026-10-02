"use client";

import { useState, useEffect } from "react";
import { Shield, ChevronLeft, ChevronRight } from "lucide-react";

interface AuditLogEntry {
  _id: string;
  adminEmail: string;
  action: string;
  resource: string;
  resourceId?: string;
  detail?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
}

const ACTION_BADGE: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  UPDATE: "bg-primary-50 text-primary-700 border border-primary-200",
  DELETE: "bg-red-50 text-red-700 border border-red-200",
};

const RESOURCE_OPTIONS = [
  { value: "", label: "全て" },
  { value: "PointRule", label: "PointRule" },
  { value: "Notification", label: "Notification" },
  { value: "Inquiry", label: "Inquiry" },
  { value: "Newsletter", label: "Newsletter" },
  { value: "LPPage", label: "LPPage" },
  { value: "Admin", label: "Admin" },
];

const ACTION_OPTIONS = [
  { value: "", label: "全て" },
  { value: "CREATE", label: "CREATE" },
  { value: "UPDATE", label: "UPDATE" },
  { value: "DELETE", label: "DELETE" },
];

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="py-3 px-4">
          <div className="h-4 bg-slate-200 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 50 });
  const [filterResource, setFilterResource] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({
    page: String(page),
    limit: "50",
  });
  if (filterResource) params.set("resource", filterResource);
  if (filterAction) params.set("action", filterAction);
  const query = params.toString();
  // 今の条件の応答がまだ届いていなければ読み込み中
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const loading = loadedQuery !== query;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/admin/api/audit-logs?${query}`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json();
        if (json.success) {
          setLogs(json.data);
          setMeta(json.meta);
        }
        setLoadedQuery(query);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("[audit-logs] fetch error:", err);
        setLoadedQuery(query);
      });
    return () => controller.abort();
  }, [query]);

  const totalPages = Math.ceil(meta.total / meta.limit);

  function handleFilterChange() {
    setPage(1);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <Shield className="w-5 h-5 text-primary-500" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900">
            監査ログ
          </h1>
        </div>
      </div>
      <p className="text-sm sm:text-base text-slate-500 mb-6 sm:mb-8 ml-12">
        管理者の操作履歴を確認できます
      </p>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 mb-6">
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-end gap-4">
          <div className="leading-normal">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              リソース
            </label>
            <div className="relative">
              <select
                value={filterResource}
                onChange={(e) => {
                  setFilterResource(e.target.value);
                  handleFilterChange();
                }}
                className="appearance-none pl-3 pr-10 h-10 text-base border border-slate-500 rounded-lg bg-white text-slate-900 cursor-pointer hover:border-black"
              >
                {RESOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>

          <div className="leading-normal">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              アクション
            </label>
            <div className="relative">
              <select
                value={filterAction}
                onChange={(e) => {
                  setFilterAction(e.target.value);
                  handleFilterChange();
                }}
                className="appearance-none pl-3 pr-10 h-10 text-base border border-slate-500 rounded-lg bg-white text-slate-900 cursor-pointer hover:border-black"
              >
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>

          <div className="sm:ml-auto text-sm text-slate-500">
            {!loading && (
              <span>
                全{" "}
                <span className="font-medium text-slate-900">{meta.total}</span>{" "}
                件
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-gray-50">
                <th
                  scope="col"
                  className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider"
                >
                  操作日時
                </th>
                <th
                  scope="col"
                  className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider"
                >
                  操作者
                </th>
                <th
                  scope="col"
                  className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider"
                >
                  アクション
                </th>
                <th
                  scope="col"
                  className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider"
                >
                  リソース
                </th>
                <th
                  scope="col"
                  className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider"
                >
                  リソースID
                </th>
                <th
                  scope="col"
                  className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider"
                >
                  詳細
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-16 text-center text-base text-slate-500"
                  >
                    該当するログがありません
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log._id}
                    className="border-b border-slate-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-4 text-sm text-slate-900 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("ja-JP", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-4 text-sm text-body">
                      {log.adminEmail}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          ACTION_BADGE[log.action] ??
                          "bg-slate-100 text-slate-700 border border-slate-200"
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-body">
                      {log.resource}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500 font-mono text-xs">
                      {log.resourceId ? (
                        <span
                          className="truncate block max-w-[140px]"
                          title={log.resourceId}
                        >
                          {log.resourceId}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500 font-mono text-xs">
                      {log.detail ? (
                        <span
                          className="truncate block max-w-[200px]"
                          title={JSON.stringify(log.detail)}
                        >
                          {JSON.stringify(log.detail)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6">
          <p className="text-sm text-slate-500">
            {(page - 1) * meta.limit + 1}〜
            {Math.min(page * meta.limit, meta.total)} 件目 / 全 {meta.total} 件
          </p>
          <div className="flex items-center gap-1 flex-wrap justify-center">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-current bg-white text-primary-500 hover:bg-primary-200 hover:text-primary-700 disabled:bg-white disabled:text-slate-300 disabled:cursor-not-allowed cursor-pointer transition-colors"
              aria-label="前のページ"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  aria-current={pageNum === page ? "page" : undefined}
                  className={`w-10 h-10 inline-flex items-center justify-center rounded-lg text-sm cursor-pointer transition-colors ${
                    pageNum === page
                      ? "bg-primary-500 text-white font-bold"
                      : "border border-current bg-white text-primary-500 hover:bg-primary-200 hover:text-primary-700 active:bg-primary-300"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-current bg-white text-primary-500 hover:bg-primary-200 hover:text-primary-700 disabled:bg-white disabled:text-slate-300 disabled:cursor-not-allowed cursor-pointer transition-colors"
              aria-label="次のページ"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
