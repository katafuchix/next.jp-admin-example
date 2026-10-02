"use client";

import { useState, useEffect, useCallback } from "react";
import { Globe, Plus, RefreshCw, X } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { WRITE_ROLES } from "@/lib/roles";
import type { AdminRole } from "@/models/Admin";

interface LpPage {
  name: string;
  slug: string;
  url: string;
  isActive: boolean;
  sessions: number;
  conversions: number;
  revenue: number;
}

interface LoadedLp {
  version: number;
  pages: LpPage[];
  error: string | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(
    n,
  );

const cvr = (conversions: number, sessions: number) =>
  sessions > 0 ? ((conversions / sessions) * 100).toFixed(1) : "0.0";

// ---- スケルトン ----
function TableSkeleton() {
  return (
    <tbody>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b border-slate-100 last:border-0">
          {Array.from({ length: 8 }).map((_, j) => (
            <td key={j} className="py-3 px-4">
              <div className="animate-pulse bg-slate-200 rounded h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

// ---- LP追加モーダル ----
interface AddLpModalProps {
  onClose: () => void;
  onAdded: () => void;
}

function AddLpModal({ onClose, onAdded }: AddLpModalProps) {
  const [form, setForm] = useState({
    name: "",
    slug: "",
    url: "",
    gaPropertyId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.slug || !form.url) {
      setFieldError("すべての項目を入力してください");
      return;
    }
    setSubmitting(true);
    setFieldError(null);
    try {
      const res = await fetch("/admin/api/lp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "登録失敗");
      onAdded();
      onClose();
    } catch (err) {
      console.error("[lp] post error:", err);
      setFieldError("登録に失敗しました。もう一度お試しください");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* モーダル本体 */}
      <div className="relative bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900">LP追加</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {fieldError && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg mb-4">
            <span className="text-sm">{fieldError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="leading-normal">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              LP名
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="春のキャンペーン"
              className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
            />
          </div>

          <div className="leading-normal">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              スラッグ
            </label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="spring-2026"
              className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
            />
          </div>

          <div className="leading-normal">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              URL
            </label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://example.com/lp/spring"
              className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
            />
          </div>

          <div className="leading-normal">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              GA プロパティID
            </label>
            <input
              type="text"
              value={form.gaPropertyId}
              onChange={(e) =>
                setForm({ ...form, gaPropertyId: e.target.value })
              }
              placeholder="例: 123456789"
              className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
            />
          </div>

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-white text-primary-500 border border-current rounded-lg hover:bg-primary-200 hover:text-primary-700 hover:underline underline-offset-[3px] active:bg-primary-300 cursor-pointer flex-1"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer flex-1 disabled:bg-slate-300 disabled:text-slate-50 disabled:no-underline disabled:cursor-not-allowed"
            >
              {submitting ? "登録中..." : "追加"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- メインページ ----
export default function LPPage() {
  const session = useAppSession();
  const role = (session?.user as { role?: AdminRole })?.role;
  const canWrite = !!role && WRITE_ROLES.includes(role);

  // 取得済みの一覧がいまの回（version）のものでなければ「読み込み中」とみなす
  // （effect の中で同期的に setState しないため）
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<LoadedLp | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchLp = useCallback(() => {
    setSyncError(null);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/admin/api/lp", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "取得失敗");
        setLoaded({ version, pages: json.data, error: null });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("[lp] fetch error:", err);
        setLoaded((prev) => ({
          version,
          pages: prev?.pages ?? [],
          error: "LPデータの取得に失敗しました",
        }));
      });
    return () => controller.abort();
  }, [version]);

  const loading = loaded?.version !== version;
  const lpPages = loaded?.pages ?? [];
  const error = syncError ?? (loading ? null : (loaded?.error ?? null));

  const handleSync = async (slug: string) => {
    try {
      const res = await fetch("/admin/api/lp/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const json = await res.json();
      if (json.success) {
        fetchLp();
      } else {
        setSyncError(json.error ?? "同期に失敗しました");
      }
    } catch (err) {
      console.error("[lp] sync error:", err);
      setSyncError("同期に失敗しました");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-10">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">LP効果分析</h1>
          <p className="text-sm text-slate-500 mt-1">
            集客用LPのセッション・CV数・CVR・売上計測
          </p>
        </div>
        {canWrite && (
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center justify-center gap-2 h-10 pl-3 pr-4 text-sm sm:text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          LP追加
        </button>
        )}
      </div>

      {/* エラー */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg mb-6"
        >
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* テーブル */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-gray-50">
              {[
                "LP名",
                "URL",
                "セッション",
                "CV数",
                "CVR (%)",
                "売上",
                "状態",
                "アクション",
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
          {loading ? (
            <TableSkeleton />
          ) : (
            <tbody>
              {lpPages.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-16 text-center text-sm text-slate-500"
                  >
                    登録されたLPがありません
                  </td>
                </tr>
              ) : (
                lpPages.map((lp) => (
                  <tr
                    key={lp.slug}
                    className="border-b border-slate-100 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-slate-900">
                          {lp.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500">
                      <a
                        href={lp.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary-500 hover:underline"
                      >
                        {lp.url}
                      </a>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700">
                      {lp.sessions.toLocaleString("ja-JP")}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700">
                      {lp.conversions.toLocaleString("ja-JP")}
                    </td>
                    <td className="py-3 px-4 text-sm font-semibold text-slate-900">
                      {cvr(lp.conversions, lp.sessions)}%
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700">
                      {fmt(lp.revenue)}
                    </td>
                    <td className="py-3 px-4">
                      {lp.isActive ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          公開中
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                          停止
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {canWrite && (
                      <button
                        onClick={() => handleSync(lp.slug)}
                        className="inline-flex items-center gap-1 h-8 px-3 text-xs font-bold bg-white text-primary-500 border border-current rounded-lg hover:bg-primary-200 hover:text-primary-700 hover:underline underline-offset-[3px] active:bg-primary-300 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        同期
                      </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          )}
        </table>
        </div>
      </div>

      {/* モーダル */}
      {showModal && (
        <AddLpModal onClose={() => setShowModal(false)} onAdded={fetchLp} />
      )}
    </div>
  );
}
