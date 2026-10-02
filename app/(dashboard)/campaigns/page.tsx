"use client";

import { useState, useEffect, useCallback } from "react";
import { Megaphone, Plus, X, Pencil, Trash2, Search } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { useAppSession } from "@/app/session-context";
import { WRITE_ROLES } from "@/lib/roles";
import type { AdminRole } from "@/models/Admin";

const PAGE_SIZE = 20;

type CampaignStatus = "draft" | "published" | "ended";

type Campaign = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  startAt: string;
  endAt: string;
  status: CampaignStatus;
  updatedAt: string;
};

const STATUS_OPTIONS: { value: CampaignStatus; label: string }[] = [
  { value: "draft", label: "下書き" },
  { value: "published", label: "公開中" },
  { value: "ended", label: "終了" },
];

const STATUS_BADGE: Record<CampaignStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  published: "bg-emerald-50 text-emerald-600",
  ended: "bg-gray-100 text-gray-500",
};

function statusLabel(status: CampaignStatus): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

type FormState = {
  title: string;
  body: string;
  imageUrl: string | null;
  startAt: string;
  endAt: string;
  status: CampaignStatus;
};

const INITIAL_FORM: FormState = {
  title: "",
  body: "",
  imageUrl: null,
  startAt: "",
  endAt: "",
  status: "draft",
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function toLocalInputValue(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function toFormState(item: Campaign): FormState {
  return {
    title: item.title,
    body: item.body,
    imageUrl: item.imageUrl,
    startAt: toLocalInputValue(item.startAt),
    endAt: toLocalInputValue(item.endAt),
    status: item.status,
  };
}

function formatDateTime(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CampaignsPage() {
  const session = useAppSession();
  const role = (session?.user as { role?: AdminRole })?.role;
  const canWrite = !!role && WRITE_ROLES.includes(role);

  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchItems = useCallback(async (q: string, p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("search", q);
      params.set("page", String(p));
      params.set("limit", String(PAGE_SIZE));
      const res = await fetch(`/admin/api/campaigns?${params}`);
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
    setError(null);
    setShowModal(true);
  }

  function openEdit(item: Campaign) {
    setEditingId(item.id);
    setForm(toFormState(item));
    setError(null);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(INITIAL_FORM);
    setError(null);
  }

  function buildPayload() {
    return {
      title: form.title.trim(),
      body: form.body.trim(),
      imageUrl: form.imageUrl,
      startAt: form.startAt ? new Date(form.startAt).toISOString() : "",
      endAt: form.endAt ? new Date(form.endAt).toISOString() : "",
      status: form.status,
    };
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError("対応していない画像形式です（jpg, png, webp, gifのみ）");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("画像サイズは5MB以下にしてください");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/admin/api/campaigns/upload", {
        method: "POST",
        body,
      });
      const json = await res.json();
      if (json.success) {
        setForm((prev) => ({ ...prev, imageUrl: json.data.url }));
      } else {
        setError(json.error ?? "画像のアップロードに失敗しました");
      }
    } catch {
      setError("画像のアップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }

  function handleImageRemove() {
    setForm((prev) => ({ ...prev, imageUrl: null }));
  }

  const isFormValid =
    form.title.trim() && form.body.trim() && form.startAt && form.endAt;

  async function handleSubmit() {
    if (!isFormValid) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildPayload();
      const res = editingId
        ? await fetch(`/admin/api/campaigns/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/admin/api/campaigns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const json = await res.json();
      if (json.success) {
        if (editingId) {
          await fetchItems(search, page);
        } else {
          await fetchItems(search, 1);
          setPage(1);
        }
        closeModal();
      } else {
        setError(json.error ?? "保存に失敗しました");
      }
    } catch {
      setError("保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/admin/api/campaigns/${id}`, {
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
            キャンペーン管理
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            アプリ内で配信するキャンペーンの作成・編集・公開状態の管理
          </p>
        </div>
        {canWrite && (
          <button
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            キャンペーン追加
          </button>
        )}
      </div>

      {/* 注意アラート */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg mb-6 text-sm">
        <Megaphone className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium">
            このデータは care アプリ本体が参照するキャンペーン情報です。
          </p>
          <p className="text-amber-700 mt-0.5">
            全操作は監査ログに記録されます。
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
          placeholder="タイトルで検索"
          className="w-full pl-9 pr-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
        />
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            キャンペーン一覧
          </h2>
        </div>
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-gray-50">
              {["タイトル", "ステータス", "開始日時", "終了日時", "更新日", "操作"].map(
                (h) => (
                  <th
                    key={h}
                    scope="col"
                    className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: 6 }).map((__, j) => (
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
                    <td className="py-3 px-4 text-sm font-medium text-slate-900 max-w-xs truncate">
                      {item.title}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[item.status]}`}
                      >
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap">
                      {formatDateTime(item.startAt)}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap">
                      {formatDateTime(item.endAt)}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500 whitespace-nowrap">
                      {formatDateTime(item.updatedAt)}
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
                {editingId ? "キャンペーンを編集" : "キャンペーンを追加"}
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
                  placeholder="例: 夏の健康チャレンジキャンペーン"
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
                  rows={5}
                  placeholder="キャンペーンの説明を入力"
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 resize-y hover:border-black bg-white text-slate-900"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="leading-normal">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    開始日時
                  </label>
                  <input
                    type="datetime-local"
                    value={form.startAt}
                    onChange={(e) =>
                      setForm({ ...form, startAt: e.target.value })
                    }
                    className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                  />
                </div>
                <div className="leading-normal">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    終了日時
                  </label>
                  <input
                    type="datetime-local"
                    value={form.endAt}
                    onChange={(e) =>
                      setForm({ ...form, endAt: e.target.value })
                    }
                    className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                  />
                </div>
              </div>
              <div className="leading-normal">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ステータス
                </label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as CampaignStatus,
                    })
                  }
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg hover:border-black bg-white text-slate-900"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="leading-normal">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  画像
                </label>
                {form.imageUrl ? (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.imageUrl}
                      alt="キャンペーン画像"
                      className="h-32 w-auto rounded-lg border border-slate-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleImageRemove}
                      className="absolute -top-2 -right-2 w-6 h-6 inline-flex items-center justify-center cursor-pointer bg-white text-slate-500 border border-slate-200 rounded-full hover:text-red-600 hover:bg-red-50"
                      aria-label="画像を削除"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-1 border border-dashed border-slate-300 rounded-lg px-3 py-6 text-center cursor-pointer hover:bg-gray-50 text-sm text-slate-500">
                    {uploading ? "アップロード中..." : "クリックして画像を選択"}
                    <input
                      type="file"
                      accept={ALLOWED_IMAGE_TYPES.join(",")}
                      onChange={handleImageChange}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                )}
                <p className="text-xs text-slate-500 mt-1">
                  jpg / png / webp / gif、5MBまで
                </p>
              </div>
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
                disabled={submitting || uploading || !isFormValid}
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
