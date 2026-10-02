"use client";

import { useState, useEffect } from "react";
import { Coins, Plus, X } from "lucide-react";
import { AppPointsPanel } from "@/components/features/points/AppPointsPanel";

type PointRule = {
  id: string;
  name: string;
  type: "earn" | "consume" | "expire" | "bonus";
  points: number;
  condition: string;
  isActive: boolean;
  updatedAt: string;
};

const TYPE_LABEL: Record<PointRule["type"], string> = {
  earn: "付与",
  consume: "消費",
  expire: "失効",
  bonus: "ボーナス",
};

const TYPE_BADGE: Record<PointRule["type"], string> = {
  earn: "bg-primary-100 text-primary-700",
  consume: "bg-amber-100 text-amber-700",
  expire: "bg-red-100 text-red-700",
  bonus: "bg-emerald-100 text-emerald-700",
};

type FormState = {
  name: string;
  type: PointRule["type"];
  points: string;
  condition: string;
};

const INITIAL_FORM: FormState = {
  name: "",
  type: "earn",
  points: "",
  condition: "",
};

export default function PointsPage() {
  const [rules, setRules] = useState<PointRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  // 開いたときに1回だけ取る。setState は応答が届いてから呼ぶ
  useEffect(() => {
    async function fetchRules() {
      try {
        const res = await fetch("/admin/api/points");
        const json = await res.json();
        setRules(Array.isArray(json.data) ? json.data : []);
      } catch {
        // keep empty
      } finally {
        setLoading(false);
      }
    }
    fetchRules();
  }, []);

  async function toggleActive(rule: PointRule) {
    const optimistic = rules.map((r) =>
      r.id === rule.id ? { ...r, isActive: !r.isActive } : r,
    );
    setRules(optimistic);
    try {
      await fetch(`/admin/api/points/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
    } catch {
      setRules(rules); // revert on error
    }
  }

  async function handleCreate() {
    if (!form.name || !form.points) return;
    setSubmitting(true);
    try {
      const res = await fetch("/admin/api/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          points: Number(form.points),
          condition: form.condition,
        }),
      });
      const json = await res.json();
      if (json.data) setRules((prev) => [...prev, json.data]);
      setShowModal(false);
      setForm(INITIAL_FORM);
    } catch {
      // no-op
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ポイント管理</h1>
          <p className="text-sm text-slate-500 mt-1">
            アプリで動いたポイントの実績と、付与ルールの記録
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          ルール追加
        </button>
      </div>

      <div className="mb-6">
        <AppPointsPanel />
      </div>

      {/* 付与ルールはアプリに読まれていない。アプリの付与量はアプリ側で決まっている */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg mb-6 text-sm">
        <Coins className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium">
            下の付与ルールは、アプリのポイントには反映されません。
          </p>
          <p className="text-amber-700 mt-0.5">
            アプリが付与するポイントの量はアプリ側で決まっています。ここは管理画面の中の記録です。ルールの追加・変更・削除は監査ログに記録されます。
          </p>
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            付与ルール一覧
          </h2>
        </div>
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-gray-50">
              {[
                "ルール名",
                "タイプ",
                "ポイント数",
                "条件",
                "状態",
                "更新日",
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
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="py-3 px-4">
                        <div className="animate-pulse bg-slate-200 rounded h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : rules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-4 text-sm font-medium text-slate-900">
                      {rule.name}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${TYPE_BADGE[rule.type] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {TYPE_LABEL[rule.type] ?? rule.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700">
                      {rule.points.toLocaleString("ja-JP")} pt
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500">
                      {rule.condition || "-"}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => toggleActive(rule)}
                        className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                          rule.isActive
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                      >
                        {rule.isActive ? "有効" : "無効"}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500">
                      {rule.updatedAt}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!loading && rules.length === 0 && (
          <p className="text-base text-slate-500 text-center py-16">
            ルールがありません
          </p>
        )}
      </div>

      {/* モーダル */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-md shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">
                ルール追加
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setForm(INITIAL_FORM);
                }}
                className="w-8 h-8 inline-flex items-center justify-center cursor-pointer text-slate-500 hover:text-slate-700 rounded-lg hover:bg-gray-100"
                aria-label="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="leading-normal">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ルール名
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例: ログインボーナス"
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                />
              </div>
              <div className="leading-normal">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  タイプ
                </label>
                <div className="relative">
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        type: e.target.value as PointRule["type"],
                      })
                    }
                    className="appearance-none w-full pl-3 pr-10 py-2 text-base border border-slate-500 rounded-lg hover:border-black bg-white text-slate-900"
                  >
                    <option value="earn">付与</option>
                    <option value="consume">消費</option>
                    <option value="expire">失効</option>
                    <option value="bonus">ボーナス</option>
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
                  ポイント数
                </label>
                <input
                  type="number"
                  value={form.points}
                  onChange={(e) => setForm({ ...form, points: e.target.value })}
                  placeholder="例: 100"
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                />
              </div>
              <div className="leading-normal">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  条件
                </label>
                <input
                  type="text"
                  value={form.condition}
                  onChange={(e) =>
                    setForm({ ...form, condition: e.target.value })
                  }
                  placeholder="例: 初回ログイン時のみ"
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                />
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false);
                  setForm(INITIAL_FORM);
                }}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-white text-primary-500 border border-current rounded-lg hover:bg-primary-200 hover:text-primary-700 hover:underline underline-offset-[3px] active:bg-primary-300 cursor-pointer w-full sm:w-auto"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting || !form.name || !form.points}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer disabled:bg-slate-300 disabled:text-slate-50 disabled:no-underline disabled:cursor-not-allowed w-full sm:w-auto"
              >
                {submitting ? "作成中..." : "作成"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
