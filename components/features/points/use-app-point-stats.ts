"use client";

import { useEffect, useState } from "react";
import type { AppPointStats } from "@/lib/app-points/query";
import { validateRange } from "@/components/features/user-metrics/format";

const FALLBACK_ERROR = "ポイントの集計に失敗しました";

interface Loaded {
  key: string;
  data: AppPointStats | null;
  error: string | null;
}

/**
 * /api/points/app-stats を期間ごとに取る。
 * 取得済みの結果がいまの期間のものでなければ「読み込み中」とみなす
 * （effect の中で同期的に setState しないため）。
 */
export function useAppPointStats(from: string, to: string) {
  const invalid = validateRange(from, to);
  const key = `${from}/${to}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (invalid) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ from, to });

    fetch(`/admin/api/points/app-stats?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        setLoaded(
          json.success
            ? { key, data: json.data, error: null }
            : { key, data: null, error: json.error ?? FALLBACK_ERROR },
        );
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("[points/app-stats] fetch error:", err);
        setLoaded({ key, data: null, error: FALLBACK_ERROR });
      });

    return () => controller.abort();
  }, [from, to, key, invalid]);

  if (invalid) return { data: null, loading: false, error: invalid };
  if (loaded?.key !== key) return { data: null, loading: true, error: null };
  return { data: loaded.data, loading: false, error: loaded.error };
}
