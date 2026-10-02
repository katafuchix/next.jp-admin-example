"use client";

import { useState, useEffect } from "react";
import { Mail, Plus, Users, X } from "lucide-react";

type NewsletterStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";

type Newsletter = {
  id: string;
  title: string;
  subject: string;
  status: NewsletterStatus;
  scheduledAt: string | null;
  recipientCount: number;
  openRate: number | null;
  clickRate: number | null;
};

const STATUS_LABEL: Record<NewsletterStatus, string> = {
  draft: "下書き",
  scheduled: "スケジュール済",
  sending: "配信中",
  sent: "配信済",
  failed: "失敗",
};

const STATUS_BADGE: Record<NewsletterStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  scheduled: "bg-primary-100 text-primary-700",
  sending: "bg-amber-100 text-amber-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

type FormState = {
  title: string;
  subject: string;
  body: string;
  scheduledAt: string;
};

const INITIAL_FORM: FormState = {
  title: "",
  subject: "",
  body: "",
  scheduledAt: "",
};

export default function NewsletterPage() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [subscriberCount, setSubscriberCount] = useState<number>(0);

  // 開いたときに1回だけ取る。setState は応答が届いてから呼ぶ
  useEffect(() => {
    async function fetchNewsletters() {
      try {
        const res = await fetch("/admin/api/newsletter");
        const json = await res.json();
        setNewsletters(Array.isArray(json.data) ? json.data : []);

        const subRes = await fetch("/api/subscribers?limit=1");
        const subJson = await subRes.json();
        if (subJson.success) setSubscriberCount(subJson.meta?.total ?? 0);
      } catch {
        // keep empty
      } finally {
        setLoading(false);
      }
    }
    fetchNewsletters();
  }, []);

  async function handleCreate() {
    if (!form.title || !form.subject) return;
    setSubmitting(true);
    try {
      const res = await fetch("/admin/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          subject: form.subject,
          body: form.body,
          scheduledAt: form.scheduledAt || null,
          status: "draft",
        }),
      });
      const json = await res.json();
      if (json.data) setNewsletters((prev) => [json.data, ...prev]);
      setShowModal(false);
      setForm(INITIAL_FORM);
    } catch {
      // no-op
    } finally {
      setSubmitting(false);
    }
  }

  const fmtRate = (rate: number | null) =>
    rate !== null ? rate.toFixed(1) + "%" : "-";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">メルマガ配信</h1>
          <p className="text-sm text-slate-500 mt-1">
            セグメント配信・効果測定・オプトアウト管理
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          キャンペーン作成
        </button>
      </div>

      {/* 法的注意アラート */}
      <div className="flex items-start gap-3 p-4 bg-primary-50 border border-primary-200 text-primary-800 rounded-lg mb-6 text-sm">
        <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>
          特定電子メール法に基づき、配信停止（オプトアウト）導線を全メールに含めてください。配信停止リストは自動反映されます。
        </p>
      </div>

      {/* 購読者数カード */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 mb-6">
        <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center">
          <Users className="w-5 h-5 text-primary-500" />
        </div>
        <div>
          <p className="text-xs text-slate-500">購読者数</p>
          <p className="text-2xl font-bold text-slate-900">
            {subscriberCount.toLocaleString()}
            <span className="text-sm font-normal text-slate-500 ml-1">人</span>
          </p>
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-gray-50">
              {[
                "キャンペーン名",
                "件名",
                "ステータス",
                "配信日時",
                "受信者数",
                "開封率",
                "クリック率",
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
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="py-3 px-4">
                        <div className="animate-pulse bg-slate-200 rounded h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : newsletters.map((nl) => (
                  <tr
                    key={nl.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-slate-900">
                          {nl.title}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500">
                      {nl.subject}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[nl.status] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {STATUS_LABEL[nl.status] ?? nl.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {nl.scheduledAt ?? "-"}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-700">
                      {nl.recipientCount > 0
                        ? nl.recipientCount.toLocaleString("ja-JP") + " 通"
                        : "-"}
                    </td>
                    {/* 開封率 */}
                    <td className="py-3 px-4">
                      {nl.status === "sent" && nl.openRate !== null ? (
                        <div className="min-w-[60px]">
                          <p className="text-xs text-slate-700 mb-1">
                            {fmtRate(nl.openRate)}
                          </p>
                          <div className="bg-slate-200 rounded-full h-1.5">
                            <div
                              className="bg-primary-500 h-1.5 rounded-full"
                              style={{
                                width: `${Math.min(nl.openRate, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-500">-</span>
                      )}
                    </td>
                    {/* クリック率 */}
                    <td className="py-3 px-4">
                      {nl.status === "sent" && nl.clickRate !== null ? (
                        <div className="min-w-[60px]">
                          <p className="text-xs text-slate-700 mb-1">
                            {fmtRate(nl.clickRate)}
                          </p>
                          <div className="bg-slate-200 rounded-full h-1.5">
                            <div
                              className="bg-primary-500 h-1.5 rounded-full"
                              style={{
                                width: `${Math.min(nl.clickRate, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-500">-</span>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!loading && newsletters.length === 0 && (
          <p className="text-base text-slate-500 text-center py-16">
            キャンペーンがありません
          </p>
        )}
      </div>

      {/* モーダル */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-xl p-4 sm:p-6 w-full max-w-md shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">
                キャンペーン作成
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
                  キャンペーン名
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="例: 6月ニュースレター"
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 hover:border-black bg-white text-slate-900"
                />
              </div>
              <div className="leading-normal">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  件名
                </label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) =>
                    setForm({ ...form, subject: e.target.value })
                  }
                  placeholder="例: 今月のお知らせをお届けします"
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
                  placeholder="メール本文を入力してください"
                  rows={6}
                  className="w-full px-3 py-2 text-base border border-slate-500 rounded-lg caret-primary-500 resize-none hover:border-black bg-white text-slate-900"
                />
              </div>
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
                disabled={submitting || !form.title || !form.subject}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 text-[1rem] font-bold bg-primary-500 text-white rounded-lg hover:bg-primary-700 hover:underline underline-offset-[3px] active:bg-primary-900 cursor-pointer disabled:bg-slate-300 disabled:text-slate-50 disabled:no-underline disabled:cursor-not-allowed w-full sm:w-auto"
              >
                {submitting ? "作成中..." : "下書き保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
