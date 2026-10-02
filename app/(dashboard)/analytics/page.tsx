"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Users, ChevronDown } from "lucide-react";
import {
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { RegistrationPanel } from "@/components/features/user-metrics/RegistrationPanel";
import {
  GenderRatioChart,
  type GenderItem,
} from "@/components/features/analytics/GenderRatioChart";
import { CHART, CHART_TOOLTIP_STYLE } from "@/lib/chart-colors";

interface BandItem {
  band: string;
  count: number;
}

interface ResidenceItem {
  prefecture: string;
  count: number;
}

interface InactiveUserRow {
  userId: string;
  email: string;
  name: string;
  lastLoginAt: string;
}

interface AnalyticsData {
  totalUsers: number;
  genderDistribution: GenderItem[];
  ageDistribution: BandItem[];
  residenceDistribution: ResidenceItem[];
  bmiDistribution: BandItem[];
  heightDistribution: BandItem[];
  inactiveUsers: {
    days: number;
    count: number;
    users: InactiveUserRow[];
  };
}

const AXIS_TICK = { fontSize: 11, fill: CHART.axis };

const SELECT_CLASS =
  "appearance-none h-11 pl-3 pr-9 text-base border border-slate-500 rounded-lg bg-white hover:border-black text-slate-900";
const INPUT_CLASS =
  "h-11 px-3 text-base border border-slate-500 rounded-lg hover:border-black bg-white text-slate-900";

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [gender, setGender] = useState("");
  const [plan, setPlan] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [inactiveDays, setInactiveDays] = useState("30");

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (gender) params.set("gender", gender);
  if (plan) params.set("plan", plan);
  if (ageMin) params.set("ageMin", ageMin);
  if (ageMax) params.set("ageMax", ageMax);
  params.set("inactiveDays", inactiveDays);
  const query = params.toString();
  // 今の条件の応答がまだ届いていなければ読み込み中
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const loading = loadedQuery !== query;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/admin/api/analytics?${query}`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.error ?? "取得に失敗しました");
        }
        setData(json.data);
        setError(null);
        setLoadedQuery(query);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("[analytics] fetch error:", err);
        setError("分析データの取得に失敗しました");
        setData(null);
        setLoadedQuery(query);
      });
    return () => controller.abort();
  }, [query]);

  const topResidence = data
    ? [...data.residenceDistribution]
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    : [];
  const hasResidenceData = topResidence.some((r) => r.count > 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          顧客分析
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          男女比率・年齢層・都道府県・身長体重の分布と未ログインユーザーの確認
        </p>
      </div>

      <div className="mb-6 sm:mb-8">
        <RegistrationPanel />
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="leading-normal">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            期間（登録日）
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={INPUT_CLASS}
            />
            <span className="text-slate-500">〜</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div className="leading-normal">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            性別
          </label>
          <div className="relative">
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">すべて</option>
              <option value="male">男性</option>
              <option value="female">女性</option>
              <option value="other">その他</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          </div>
        </div>

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
              className={`w-20 ${INPUT_CLASS}`}
            />
            <span className="text-slate-500">〜</span>
            <input
              type="number"
              min={0}
              max={120}
              value={ageMax}
              onChange={(e) => setAgeMax(e.target.value)}
              placeholder="上限"
              className={`w-20 ${INPUT_CLASS}`}
            />
          </div>
        </div>

        <div className="leading-normal">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            課金形態
          </label>
          <div className="relative">
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">すべて</option>
              <option value="paid">プレミアム</option>
              <option value="free">フリー</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          </div>
        </div>

        <div className="leading-normal">
          <label className="block text-xs font-medium text-slate-500 mb-1">
            未ログイン日数
          </label>
          <div className="relative">
            <select
              value={inactiveDays}
              onChange={(e) => setInactiveDays(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="7">7日以上</option>
              <option value="14">14日以上</option>
              <option value="30">30日以上</option>
              <option value="60">60日以上</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          </div>
        </div>
      </div>

      {!loading && error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg mb-6">
          <span className="text-sm">{error}</span>
        </div>
      )}

      {loading || !data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6"
            >
              <div className="animate-pulse bg-slate-200 rounded h-48" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 mb-6">
            絞り込み対象ユーザー数:{" "}
            <span className="font-semibold text-slate-900">
              {data.totalUsers.toLocaleString("ja-JP")}名
            </span>
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                男女比率
              </h2>
              {data.totalUsers === 0 ? (
                <p className="text-sm text-slate-500 text-center py-16">
                  データがありません
                </p>
              ) : (
                <GenderRatioChart items={data.genderDistribution} />
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                年齢層
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={data.ageDistribution}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                  <XAxis
                    dataKey="band"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill={CHART.blue} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                都道府県（上位10件）
              </h2>
              {!hasResidenceData ? (
                <p className="text-sm text-slate-500 text-center py-16">
                  データがありません
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={topResidence}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                    <XAxis
                      type="number"
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="prefecture"
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      width={64}
                    />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Bar dataKey="count" fill={CHART.blue} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
              <h2 className="text-base font-semibold text-slate-900 mb-4">
                BMI分布（身長・体重）
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={data.bmiDistribution}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                  <XAxis
                    dataKey="band"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={32}
                    allowDecimals={false}
                  />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="count" fill={CHART.green} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-primary-500" />
                {data.inactiveUsers.days}日以上未ログインのユーザー
              </h2>
              <span className="text-2xl font-bold text-slate-900">
                {data.inactiveUsers.count.toLocaleString("ja-JP")}
                <span className="text-sm font-normal text-slate-500 ml-1">
                  名
                </span>
              </span>
            </div>
            {data.inactiveUsers.users.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                該当ユーザーはいません
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        {["メール", "名前", "最終ログイン"].map((h) => (
                          <th
                            key={h}
                            scope="col"
                            className="text-left py-2 px-3 text-xs font-medium text-slate-500"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.inactiveUsers.users.map((u) => (
                        <tr
                          key={u.userId}
                          onClick={() => router.push(`/customers/${u.userId}`)}
                          className="border-b border-slate-100 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          <td className="py-2 px-3 text-slate-700">
                            {u.email}
                          </td>
                          <td className="py-2 px-3 text-slate-700">
                            {u.name || "—"}
                          </td>
                          <td className="py-2 px-3 text-slate-500">
                            {u.lastLoginAt ? u.lastLoginAt.slice(0, 10) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.inactiveUsers.count > data.inactiveUsers.users.length && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <button
                      onClick={() => router.push("/customers")}
                      className="text-sm text-primary-500 hover:underline cursor-pointer"
                    >
                      すべて表示（顧客一覧へ）
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
