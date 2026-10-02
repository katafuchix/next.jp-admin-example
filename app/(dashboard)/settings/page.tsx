"use client";

import { useState, useEffect } from "react";
import { useAppSession } from "@/app/session-context";
import { Shield, Plus, X } from "lucide-react";

// ---- 型定義 ----
interface Admin {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "OPERATOR" | "ANALYST" | "SUPPORT";
  isActive: boolean;
  lastLoginAt: string | null;
}

// ---- ロールバッジ ----
const ROLE_BADGE: Record<string, string> = {
  SUPER_ADMIN: "bg-primary-100 text-primary-700",
  OPERATOR: "bg-emerald-100 text-emerald-700",
  ANALYST: "bg-amber-100 text-amber-700",
  SUPPORT: "bg-slate-100 text-slate-700",
};
const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "システム管理者",
  OPERATOR: "運営担当",
  ANALYST: "分析閲覧",
  SUPPORT: "サポート",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium ${ROLE_BADGE[role] ?? "bg-slate-100 text-slate-700"}`}
    >
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

// ---- 追加モーダル ----
interface AddModalProps {
  onClose: () => void;
  onAdded: () => void;
}
function AddModal({ onClose, onAdded }: AddModalProps) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "OPERATOR",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!form.name || !form.email || !form.password) {
      setError("全項目を入力してください");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/admin/api/settings/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const d = await r.json();
        setError(d.error ?? "追加に失敗しました");
        return;
      }
      onAdded();
      onClose();
    } catch {
      setError("ネットワークエラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-[440px] p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">管理者を追加</h2>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="leading-normal">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              名前
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 outline-none hover:border-black bg-white text-slate-900"
            />
          </div>
          <div className="leading-normal">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              メールアドレス
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 outline-none hover:border-black bg-white text-slate-900"
            />
          </div>
          <div className="leading-normal">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              パスワード
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 outline-none hover:border-black bg-white text-slate-900"
            />
          </div>
          <div className="leading-normal">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              ロール
            </label>
            <div className="relative">
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="appearance-none w-full pl-3 pr-10 py-2 text-base border border-slate-500 rounded-lg outline-none bg-white text-slate-700 hover:border-black"
              >
                {Object.entries(ROLE_LABEL).map(([val, label]) => (
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
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-white text-primary-500 border border-current rounded-lg hover:bg-primary-200 hover:text-primary-700 hover:underline underline-offset-[3px] active:bg-primary-300 cursor-pointer flex-1"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer disabled:bg-slate-300 disabled:text-slate-50 disabled:no-underline disabled:cursor-not-allowed flex-1"
          >
            {saving ? "追加中..." : "追加"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- 編集モーダル ----
interface EditModalProps {
  admin: Admin;
  onClose: () => void;
  onUpdated: () => void;
}
function EditModal({ admin, onClose, onUpdated }: EditModalProps) {
  const [form, setForm] = useState({ name: admin.name, role: admin.role });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!form.name) {
      setError("名前を入力してください");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/admin/api/settings/admins/${admin.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const d = await r.json();
        setError(d.error ?? "更新に失敗しました");
        return;
      }
      onUpdated();
      onClose();
    } catch {
      setError("ネットワークエラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-[440px] p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">管理者を編集</h2>
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="leading-normal">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              名前
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 outline-none hover:border-black bg-white text-slate-900"
            />
          </div>
          <div className="leading-normal">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              ロール
            </label>
            <div className="relative">
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as Admin["role"] })
                }
                className="appearance-none w-full pl-3 pr-10 py-2 text-base border border-slate-500 rounded-lg outline-none bg-white text-slate-700 hover:border-black"
              >
                {Object.entries(ROLE_LABEL).map(([val, label]) => (
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
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-white text-primary-500 border border-current rounded-lg hover:bg-primary-200 hover:text-primary-700 hover:underline underline-offset-[3px] active:bg-primary-300 cursor-pointer flex-1"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer disabled:bg-slate-300 disabled:text-slate-50 disabled:no-underline disabled:cursor-not-allowed flex-1"
          >
            {saving ? "更新中..." : "更新"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- メインページ ----
export default function SettingsPage() {
  const session = useAppSession();
  const role = (session?.user as { role?: string })?.role;

  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<Admin | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  // 一覧取得。追加・更新のあとは version を進めて取り直す
  const [version, setVersion] = useState(0);
  const reloadAdmins = () => {
    setLoading(true);
    setVersion((v) => v + 1);
  };

  useEffect(() => {
    if (role !== "SUPER_ADMIN") return;
    const controller = new AbortController();
    fetch("/admin/api/settings/admins", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setAdmins(Array.isArray(data) ? data : (data.data ?? [])))
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [role, version]);

  const handleToggleActive = async (admin: Admin) => {
    setToggling(admin.id);
    try {
      if (admin.isActive) {
        // 無効化 → 論理削除
        await fetch(`/admin/api/settings/admins/${admin.id}`, {
          method: "DELETE",
        });
      } else {
        // 有効化
        await fetch(`/admin/api/settings/admins/${admin.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: true }),
        });
      }
      // 楽観的更新
      setAdmins((prev) =>
        prev.map((a) =>
          a.id === admin.id ? { ...a, isActive: !a.isActive } : a,
        ),
      );
    } catch {
      // silent
    } finally {
      setToggling(null);
    }
  };

  // ローディング中
  if (!session) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10">
        <p className="text-base text-slate-500">読み込み中...</p>
      </div>
    );
  }

  // 権限なし
  if (role !== "SUPER_ADMIN") {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-10">
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
          <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>この画面はシステム管理者のみアクセスできます。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 md:py-10">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            管理者設定
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            管理者アカウントとロールの管理
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center justify-center gap-2 h-10 pl-3 pr-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          管理者追加
        </button>
      </div>

      {/* 注意バナー */}
      <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg mb-6 text-sm">
        <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>
          この画面はシステム管理者のみアクセスできます。管理者の追加・変更・削除は全て監査ログに記録されます。
        </p>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-200 bg-gray-50">
              {["名前", "メール", "ロール", "状態", "最終ログイン", "操作"].map(
                (h) => (
                  <th
                    key={h}
                    scope="col"
                    className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="py-16 text-center text-base text-slate-500"
                >
                  読み込み中...
                </td>
              </tr>
            ) : admins.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="py-16 text-center text-base text-slate-500"
                >
                  管理者が登録されていません
                </td>
              </tr>
            ) : (
              admins.map((admin) => (
                <tr
                  key={admin.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-gray-50 transition-colors"
                >
                  {/* 名前 */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full bg-primary-50 inline-flex items-center justify-center flex-shrink-0"
                        role="img"
                        aria-label={admin.name}
                      >
                        <span className="text-primary-500 text-sm font-medium">
                          {admin.name.charAt(0)}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-slate-900">
                        {admin.name}
                      </span>
                    </div>
                  </td>
                  {/* メール */}
                  <td className="py-3 px-4 text-sm text-slate-500">
                    {admin.email}
                  </td>
                  {/* ロール */}
                  <td className="py-3 px-4">
                    <RoleBadge role={admin.role} />
                  </td>
                  {/* 状態 */}
                  <td className="py-3 px-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${admin.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                    >
                      {admin.isActive ? "有効" : "無効"}
                    </span>
                  </td>
                  {/* 最終ログイン */}
                  <td className="py-3 px-4 text-sm text-slate-500">
                    {admin.lastLoginAt ?? "-"}
                  </td>
                  {/* 操作 */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditTarget(admin)}
                        className="inline-flex items-center h-8 px-3 text-sm font-bold bg-white text-primary-500 border border-current rounded-lg hover:bg-primary-200 hover:text-primary-700 hover:underline underline-offset-[3px] active:bg-primary-300 cursor-pointer"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleToggleActive(admin)}
                        disabled={toggling === admin.id}
                        className="inline-flex items-center h-8 px-3 text-sm font-bold bg-white text-red-600 border border-current rounded-md hover:bg-red-50 hover:underline underline-offset-[3px] active:bg-red-100 cursor-pointer disabled:text-slate-300 disabled:no-underline disabled:cursor-not-allowed"
                      >
                        {toggling === admin.id
                          ? "処理中..."
                          : admin.isActive
                            ? "無効化"
                            : "有効化"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 追加モーダル */}
      {showAdd && (
        <AddModal onClose={() => setShowAdd(false)} onAdded={reloadAdmins} />
      )}

      {/* 編集モーダル */}
      {editTarget && (
        <EditModal
          admin={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={reloadAdmins}
        />
      )}
    </div>
  );
}
