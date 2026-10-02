"use client";

import { useEffect, useState } from "react";
import { jstDayKey } from "@/lib/jst-date";
import type { MonthlyRevenue } from "@/lib/revenue-monthly";

const FALLBACK_ERROR = "収益データの取得に失敗しました";
const FIRST_YEAR = 2024;

interface Loaded {
  year: string;
  data: MonthlyRevenue | null;
  error: string | null;
}

/** 日本時間の今年 */
export function currentYear(): string {
  return jstDayKey(new Date()).slice(0, 4);
}

/** 年の選択肢。新しい年が先 */
export function yearOptions(): string[] {
  const last = Number(currentYear());
  return Array.from({ length: last - FIRST_YEAR + 1 }, (_, i) =>
    String(last - i),
  );
}

/**
 * /api/revenue を年ごとに取る。
 * 取得済みの結果がいまの年のものでなければ「読み込み中」とみなす
 * （effect の中で同期的に setState しないため）。
 */
export function useMonthlyRevenue(year: string) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ year });

    fetch(`/admin/api/revenue?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        setLoaded(
          json.success
            ? { year, data: json.data, error: null }
            : { year, data: null, error: json.error ?? FALLBACK_ERROR },
        );
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("[revenue] fetch error:", err);
        setLoaded({ year, data: null, error: FALLBACK_ERROR });
      });

    return () => controller.abort();
  }, [year]);

  if (loaded?.year !== year) return { data: null, loading: true, error: null };
  return { data: loaded.data, loading: false, error: loaded.error };
}
