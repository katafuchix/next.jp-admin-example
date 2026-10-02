"use client";

import { useEffect, useState } from "react";
import type { ReachCounts } from "@/lib/notification-reach";

const FALLBACK_ERROR = "通知が届く人数を数えられませんでした";

export interface NotificationReach {
  counts: ReachCounts;
  countedAt: string;
}

interface Loaded {
  data: NotificationReach | null;
  error: string | null;
}

/** /api/notifications/reach を開いたときに1回だけ取る */
export function useNotificationReach() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/admin/api/notifications/reach", { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json();
        setLoaded(
          json.success
            ? { data: json.data, error: null }
            : { data: null, error: json.error ?? FALLBACK_ERROR },
        );
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("[notifications/reach] fetch error:", err);
        setLoaded({ data: null, error: FALLBACK_ERROR });
      });

    return () => controller.abort();
  }, []);

  if (!loaded) return { data: null, loading: true, error: null };
  return { data: loaded.data, loading: false, error: loaded.error };
}
