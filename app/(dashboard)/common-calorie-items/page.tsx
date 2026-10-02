"use client";

import { useState, useEffect, useCallback } from "react";
import { Apple, Plus, X, Pencil, Trash2, Search } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { useAppSession } from "@/app/session-context";
import { WRITE_ROLES } from "@/lib/roles";
import type { AdminRole } from "@/models/Admin";

const PAGE_SIZE = 20;

type CommonCalorieItem = {
  id: string;
  name: string;
  calories: number;
  nutrition: {
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fiber: number | null;
    sugar: number | null;
  };
  source: string | null;
  updatedAt: string;
};

function sourceLabel(source: string | null): string {
  if (source === "ai") return "AI生成";
  if (source === "manual") return "手動";
  return "不明";
}

type FormState = {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  sugar: string;
};

const INITIAL_FORM: FormState = {
  name: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  fiber: "",
  sugar: "",
};

function toFormState(item: CommonCalorieItem): FormState {
  return {
    name: item.name,
    calories: String(item.calories),
    protein: item.nutrition.protein != null ? String(item.nutrition.protein) : "",
    carbs: item.nutrition.carbs != null ? String(item.nutrition.carbs) : "",
    fat: item.nutrition.fat != null ? String(item.nutrition.fat) : "",
    fiber: item.nutrition.fiber != null ? String(item.nutrition.fiber) : "",
    sugar: item.nutrition.sugar != null ? String(item.nutrition.sugar) : "",
  };
}

function formatNum(n: number | null): string {
  return n == null ? "-" : `${n}`;
}

export default function CommonCalorieItemsPage() {
  const session = useAppSession();
  const role = (session?.user as { role?: AdminRole })?.role;
  const canWrite = !!role && WRITE_ROLES.includes(role);

  const [items, setItems] = useState<CommonCalorieItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchItems = useCallback(async (q: string, p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("search", q);
      params.set("page", String(p));
      params.set("limit", String(PAGE_SIZE));
      const res = await fetch(`/admin/api/common-calorie-items?${params}`);
      const json = await res.json();
      setItems(Array.isArray(json.data) ? json.data : []);
      setTotal(typeof json.meta?.total === "number" ? json.meta.total : 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchItems(search, page), 300);
    return () => clearTimeout(timer);
  }, [search, page, fetchItems]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function openCreate() {
    setEditingId(null);
    setForm(INITIAL_FORM);
    setShowModal(true);
  }

  function openEdit(item: CommonCalorieItem) {
    setEditingId(item.id);
    setForm(toFormState(item));
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(INITIAL_FORM);
  }

  function buildPayload() {
    return {
      name: form.name.trim(),
      calories: Number(form.calories),
      nutrition: {
        protein: form.protein === "" ? null : Number(form.protein),
        carbs: form.carbs === "" ? null : Number(form.carbs),
        fat: form.fat === "" ? null : Number(form.fat),
        fiber: form.fiber === "" ? null : Number(form.fiber),
        sugar: form.sugar === "" ? null : Number(form.sugar),
      },
    };
  }

  async function handleSubmit() {
    if (!form.name.trim() || form.calories === "") return;
    setSubmitting(true);
    try {
      if (editingId) {
        const res = await fetch(`/admin/api/common-calorie-items/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload()),
        });
        const json = await res.json();
        if (json.success) {
          await fetchItems(search, page);
        }
      } else {
        const res = await fetch("/admin/api/common-calorie-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload()),
        });
        const json = await res.json();
        if (json.success) {
          await fetchItems(search, 1);
          setPage(1);
        }
      }
      closeModal();
    } catch {
      // no-op
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/admin/api/common-calorie-items/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        const isLastItemOnPage = items.length === 1 && page > 1;
        const nextPage = isLastItemOnPage ? page - 1 : page;
        if (isLastItemOnPage) setPage(nextPage);
        await fetchItems(search, nextPage);
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
          <h1 className="text-2xl font-bold text-slate-900">
            食事データ
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            アプリ全体で参照される共通食品カロリーデータの管理
          </p>
        </div>
        {canWrite && (
          <button
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            項目追加
          </button>
        )}
      </div>

      {/* 注意アラート */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg mb-6 text-sm">
        <Apple className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium">
            このデータは care アプリ本体が参照する共通マスタです。
          </p>
          <p className="text-amber-700 mt-0.5">
            変更はアプリ利用者のカロリー計算に直接影響します。全操作は監査ログに記録されます。
          </p>
        </div>
      </div>

      {/* 検索 */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="食品名で検索"
          className="w-full pl-9 pr-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
        />
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            食品一覧
          </h2>
        </div>
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-gray-50">
              {[
                "食品名",
                "カロリー",
                "たんぱく質",
                "炭水化物",
                "脂質",
                "食物繊維",
                "糖質",
                "登録元",
                "更新日",
                "操作",
              ].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: 10 }).map((__, j) => (
                      <td key={j} className="py-3 px-4">
                        <div className="animate-pulse bg-slate-200 rounded h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-4 text-sm font-medium text-slate-900 whitespace-nowrap">
                      {item.name}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700 whitespace-nowrap">
                      {item.calories.toLocaleString("ja-JP")} kcal
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap">
                      {formatNum(item.nutrition.protein)} g
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap">
                      {formatNum(item.nutrition.carbs)} g
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap">
                      {formatNum(item.nutrition.fat)} g
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap">
                      {formatNum(item.nutrition.fiber)} g
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap">
                      {formatNum(item.nutrition.sugar)} g
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          item.source
                            ? "bg-slate-100 text-slate-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {sourceLabel(item.source)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap">
                      {item.updatedAt
                        ? new Date(item.updatedAt).toLocaleDateString("ja-JP")
                        : "-"}
                    </td>
                    <td className="py-3 px-4">
                      {canWrite && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(item)}
                            className="w-8 h-8 inline-flex items-center justify-center cursor-pointer text-slate-500 hover:text-primary-600 rounded-lg hover:bg-primary-50"
                            aria-label="編集"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            disabled={deletingId === item.id}
                            className="w-8 h-8 inline-flex items-center justify-center cursor-pointer text-slate-500 hover:text-red-600 rounded-md hover:bg-red-50 active:bg-red-100 disabled:text-slate-300 disabled:cursor-not-allowed"
                            aria-label="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && (
          <p className="text-base text-slate-500 text-center py-16">
            データがありません
          </p>
        )}
      </div>

      {/* ページネーション */}
      {!loading && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6">
          <p className="text-sm text-slate-500">
            {(page - 1) * PAGE_SIZE + 1}〜{Math.min(page * PAGE_SIZE, total)}{" "}
            件目 / 全 {total} 件
          </p>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* モーダル */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-md shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">
                {editingId ? "食品を編集" : "食品を追加"}
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
                  食品名
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例: 白米ご飯"
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                />
              </div>
              <div className="leading-normal">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  カロリー (kcal)
                </label>
                <input
                  type="number"
                  value={form.calories}
                  onChange={(e) =>
                    setForm({ ...form, calories: e.target.value })
                  }
                  placeholder="例: 250"
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="leading-normal">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    たんぱく質 (g)
                  </label>
                  <input
                    type="number"
                    value={form.protein}
                    onChange={(e) =>
                      setForm({ ...form, protein: e.target.value })
                    }
                    className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                  />
                </div>
                <div className="leading-normal">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    炭水化物 (g)
                  </label>
                  <input
                    type="number"
                    value={form.carbs}
                    onChange={(e) =>
                      setForm({ ...form, carbs: e.target.value })
                    }
                    className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                  />
                </div>
                <div className="leading-normal">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    脂質 (g)
                  </label>
                  <input
                    type="number"
                    value={form.fat}
                    onChange={(e) => setForm({ ...form, fat: e.target.value })}
                    className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                  />
                </div>
                <div className="leading-normal">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    食物繊維 (g)
                  </label>
                  <input
                    type="number"
                    value={form.fiber}
                    onChange={(e) =>
                      setForm({ ...form, fiber: e.target.value })
                    }
                    className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                  />
                </div>
                <div className="leading-normal col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    糖質 (g)
                  </label>
                  <input
                    type="number"
                    value={form.sugar}
                    onChange={(e) =>
                      setForm({ ...form, sugar: e.target.value })
                    }
                    className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                  />
                </div>
              </div>
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
                disabled={submitting || !form.name.trim() || form.calories === ""}
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
