"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PREFECTURES } from "@/lib/prefectures";
import { useAppSession } from "@/app/session-context";
import { EXPORT_ROLES } from "@/lib/roles";
import type { AdminRole } from "@/models/Admin";

interface Customer {
  userId: string;
  email: string;
  name: string;
  status: "online" | "offline";
  plan: string;
  createdAt: string;
  lastLoginAt: string;
  loginStreakDays: number;
  age: number | null;
  gender: string | null;
  residence: string | null;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
}

const STATUS_LABEL: Record<string, string> = {
  online: "オンライン",
  offline: "オフライン",
};

const STATUS_CLASS: Record<string, string> = {
  online: "bg-emerald-100 text-emerald-700",
  offline: "bg-slate-100 text-slate-600",
};

const GENDER_LABEL: Record<string, string> = {
  male: "男性",
  female: "女性",
  other: "その他",
};

const TABLE_COLUMNS = [
  { label: "ユーザーID", hide: "hidden lg:table-cell" },
  { label: "メール", hide: "" },
  { label: "名前", hide: "" },
  { label: "性別", hide: "hidden sm:table-cell" },
  { label: "年齢", hide: "hidden sm:table-cell" },
  { label: "都道府県", hide: "hidden md:table-cell" },
  { label: "ステータス", hide: "" },
  { label: "プラン", hide: "hidden sm:table-cell" },
  { label: "登録日", hide: "hidden md:table-cell" },
  { label: "最終ログイン", hide: "hidden md:table-cell" },
  { label: "連続ログイン", hide: "hidden lg:table-cell" },
] as const;

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
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

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function TableSkeleton() {
  return (
    <tbody>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-slate-100 last:border-0">
          {TABLE_COLUMNS.map((col, j) => (
            <td key={j} className={`${col.hide} py-2.5 px-3`}>
              <div className="animate-pulse bg-slate-200 rounded h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

const LIMIT = 20;

type StatusFilter = "" | "online" | "offline";

export default function CustomersPage() {
  const router = useRouter();
  const session = useAppSession();
  const role = (session?.user as { role?: AdminRole })?.role;
  const canExport = !!role && EXPORT_ROLES.includes(role);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: LIMIT });
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [gender, setGender] = useState("");
  const [residence, setResidence] = useState("");
  const [plan, setPlan] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [inactiveDays, setInactiveDays] = useState("");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search, 300);

  // 絞り込みを変えたら1ページ目へ戻す。描画中に合わせるので、前のページ番号のまま取りに行かない
  const filterKey = JSON.stringify([
    debouncedSearch,
    status,
    gender,
    residence,
    plan,
    ageMin,
    ageMax,
    inactiveDays,
  ]);
  const [pageFilterKey, setPageFilterKey] = useState(filterKey);
  if (pageFilterKey !== filterKey) {
    setPageFilterKey(filterKey);
    setPage(1);
  }

  const query = new URLSearchParams({
    search: debouncedSearch,
    status,
    gender,
    residence,
    plan,
    ageMin,
    ageMax,
    inactiveDays,
    page: String(page),
    limit: String(LIMIT),
  }).toString();
  // 今の条件の応答がまだ届いていなければ読み込み中
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const loading = loadedQuery !== query;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/admin/api/customers?${query}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "取得失敗");
        setCustomers(json.data);
        setMeta(json.meta);
        setError(null);
        setLoadedQuery(query);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("[customers] fetch error:", err);
        setError("顧客データの取得に失敗しました");
        setLoadedQuery(query);
      });
    return () => controller.abort();
  }, [query]);

  const totalPages = Math.ceil(meta.total / LIMIT);
  const start = (meta.page - 1) * LIMIT + 1;
  const end = Math.min(meta.page * LIMIT, meta.total);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            顧客管理
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            登録ユーザーの一覧・詳細・ステータス管理
          </p>
        </div>
        {canExport && (
          <button
            onClick={() =>
              window.open("/admin/api/export?type=customers", "_blank")
            }
            className="inline-flex items-center justify-center gap-2 h-10 px-4 text-sm sm:text-[1rem] font-bold bg-white text-primary-500 border border-current rounded-lg hover:bg-primary-200 hover:text-primary-700 hover:underline underline-offset-[3px] active:bg-primary-300 cursor-pointer w-full sm:w-auto"
          >
            <Download className="w-4 h-4" />
            CSVエクスポート
          </button>
        )}
      </div>

      {/* エラー */}
      {!loading && error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg mb-6">
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* 検索・フィルター */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        {/* flex-1 だと基準幅0から縮み、横の絞り込みに押されて案内文が読めなくなる */}
        <div className="leading-normal w-full sm:w-80">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ユーザーID・メール・名前で検索"
              className="w-full pl-9 pr-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
            />
          </div>
        </div>

        {/* ステータスフィルター */}
        <div className="flex flex-wrap gap-1">
          {(
            [
              { value: "", label: "すべて" },
              { value: "online", label: "オンライン" },
              { value: "offline", label: "オフライン" },
            ] as { value: StatusFilter; label: string }[]
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border cursor-pointer transition-colors ${
                status === opt.value
                  ? "bg-primary-50 border-primary-500 text-primary-700 font-medium"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-gray-50"
              }`}
              aria-selected={status === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 性別 */}
        <div className="leading-normal">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            性別
          </label>
          <div className="relative">
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="appearance-none h-11 pl-3 pr-9 text-base border border-slate-500 rounded-lg bg-white hover:border-black text-slate-900"
            >
              <option value="">すべて</option>
              <option value="male">男性</option>
              <option value="female">女性</option>
              <option value="other">その他</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          </div>
        </div>

        {/* 都道府県 */}
        <div className="leading-normal">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            都道府県
          </label>
          <div className="relative">
            <select
              value={residence}
              onChange={(e) => setResidence(e.target.value)}
              className="appearance-none h-11 pl-3 pr-9 text-base border border-slate-500 rounded-lg bg-white hover:border-black text-slate-900"
            >
              <option value="">すべて</option>
              {PREFECTURES.map((pref) => (
                <option key={pref} value={pref}>
                  {pref}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          </div>
        </div>

        {/* 課金形態 */}
        <div className="leading-normal">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            課金形態
          </label>
          <div className="relative">
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="appearance-none h-11 pl-3 pr-9 text-base border border-slate-500 rounded-lg bg-white hover:border-black text-slate-900"
            >
              <option value="">すべて</option>
              <option value="paid">プレミアム</option>
              <option value="free">フリー</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          </div>
        </div>

        {/* 年齢 */}
        <div className="leading-normal">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            年齢
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={120}
              value={ageMin}
              onChange={(e) => setAgeMin(e.target.value)}
              placeholder="下限"
              className="w-20 h-11 px-3 text-base border border-slate-500 rounded-lg hover:border-black bg-white text-slate-900"
            />
            <span className="text-slate-500">〜</span>
            <input
              type="number"
              min={0}
              max={120}
              value={ageMax}
              onChange={(e) => setAgeMax(e.target.value)}
              placeholder="上限"
              className="w-20 h-11 px-3 text-base border border-slate-500 rounded-lg hover:border-black bg-white text-slate-900"
            />
          </div>
        </div>

        {/* 未ログイン日数 */}
        <div className="leading-normal">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            未ログイン日数
          </label>
          <div className="relative">
            <select
              value={inactiveDays}
              onChange={(e) => setInactiveDays(e.target.value)}
              className="appearance-none h-11 pl-3 pr-9 text-base border border-slate-500 rounded-lg bg-white hover:border-black text-slate-900"
            >
              <option value="">指定なし</option>
              <option value="7">7日以上</option>
              <option value="14">14日以上</option>
              <option value="30">30日以上</option>
              <option value="60">60日以上</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          </div>
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-gray-50">
              {TABLE_COLUMNS.map((col) => (
                <th
                  key={col.label}
                  scope="col"
                  className={`${col.hide} text-left py-2.5 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          {loading ? (
            <TableSkeleton />
          ) : (
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td
                    colSpan={TABLE_COLUMNS.length}
                    className="py-16 text-center text-sm text-slate-500"
                  >
                    該当する顧客が見つかりません
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr
                    key={c.userId}
                    onClick={() => router.push(`/customers/${c.userId}`)}
                    className="border-b border-slate-100 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <td className="hidden lg:table-cell py-2.5 px-3 text-sm text-slate-500 font-mono whitespace-nowrap">
                      {c.userId}
                    </td>
                    <td className="py-2.5 px-3 text-sm text-slate-700 whitespace-nowrap max-w-[160px] truncate">
                      {c.email}
                    </td>
                    <td className="py-2.5 px-3 text-sm font-medium text-slate-900 whitespace-nowrap">
                      {c.name}
                    </td>
                    <td className="hidden sm:table-cell py-2.5 px-3 text-sm text-slate-700 whitespace-nowrap">
                      {c.gender ? (GENDER_LABEL[c.gender] ?? c.gender) : "—"}
                    </td>
                    <td className="hidden sm:table-cell py-2.5 px-3 text-sm text-slate-700 whitespace-nowrap">
                      {c.age != null ? `${c.age}歳` : "—"}
                    </td>
                    <td className="hidden md:table-cell py-2.5 px-3 text-sm text-slate-700 whitespace-nowrap">
                      {c.residence ?? "—"}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="hidden sm:table-cell py-2.5 px-3 text-sm text-slate-700 whitespace-nowrap">
                      {c.plan}
                    </td>
                    <td className="hidden md:table-cell py-2.5 px-3 text-sm text-slate-500 whitespace-nowrap">
                      {c.createdAt ? c.createdAt.slice(0, 10) : "—"}
                    </td>
                    <td className="hidden md:table-cell py-2.5 px-3 text-sm text-slate-500 whitespace-nowrap">
                      {c.lastLoginAt ? c.lastLoginAt.slice(0, 10) : "—"}
                    </td>
                    <td className="hidden lg:table-cell py-2.5 px-3 text-sm text-slate-700 whitespace-nowrap">
                      {c.loginStreakDays > 0 ? `${c.loginStreakDays}日` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          )}
        </table>
      </div>

      {/* ページネーション */}
      {!loading && meta.total > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-4">
          <p className="text-sm text-slate-500">
            {meta.total.toLocaleString("ja-JP")}件中 {start}–{end}件を表示
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="w-10 h-10 rounded-lg text-sm cursor-pointer transition-colors bg-white border border-current text-primary-500 hover:bg-primary-200 hover:text-primary-700 disabled:bg-white disabled:text-slate-300 disabled:cursor-not-allowed"
            >
              ‹
            </button>
            <span className="w-10 h-10 inline-flex items-center justify-center text-sm bg-primary-500 text-white rounded-lg font-bold">
              {page}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="w-10 h-10 rounded-lg text-sm cursor-pointer transition-colors bg-white border border-current text-primary-500 hover:bg-primary-200 hover:text-primary-700 disabled:bg-white disabled:text-slate-300 disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
