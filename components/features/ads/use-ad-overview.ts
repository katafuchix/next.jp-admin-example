"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdOverview } from "@/lib/ad-sources/overview";
import { validateRange } from "@/components/features/user-metrics/format";

const FALLBACK_ERROR = "広告データの取得に失敗しました";

interface Loaded {
  key: string;
  data: AdOverview | null;
  error: string | null;
}

/**
 * /api/ads を期間ごとに取る。reload() で同じ期間を取り直す（同期の直後など）。
 * 取得済みの結果がいまの期間・回のものでなければ「読み込み中」とみなす
 * （effect の中で同期的に setState しないため）。
 */
export function useAdOverview(from: string, to: string) {
  const invalid = validateRange(from, to);
  const [version, setVersion] = useState(0);
  const key = `${from}/${to}/${version}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (invalid) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ from, to });

    fetch(`/admin/api/ads?${params.toString()}`, { signal: controller.signal })
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
        console.error("[ads] fetch error:", err);
        setLoaded({ key, data: null, error: FALLBACK_ERROR });
      });

    return () => controller.abort();
  }, [from, to, key, invalid]);

  if (invalid) return { data: null, loading: false, error: invalid, reload };
  if (loaded?.key !== key) {
    return { data: null, loading: true, error: null, reload };
  }
  return { data: loaded.data, loading: false, error: loaded.error, reload };
}
