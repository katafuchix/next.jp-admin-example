"use client";

import { useState } from "react";
import { AlertCircle, CircleCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { summarizeSync } from "./format";

const SYNC_FAILED = "広告データの同期に失敗しました";

type SyncState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

function errorMessage(status: number, error: unknown): string {
  if (status === 401) return "ログインし直してください";
  if (status === 403) return "同期する権限がありません";
  return typeof error === "string" && error ? error : SYNC_FAILED;
}

/**
 * 全媒体の直近7日を今すぐ取り込む（自動の同期と同じ処理）。
 * 媒体ごとの成否は下の表に出るので、ここでは件数だけ伝えて onSynced で表を取り直す。
 */
export function SyncButton({ onSynced }: { onSynced: () => void }) {
  const [state, setState] = useState<SyncState>({ kind: "idle" });
  const running = state.kind === "running";

  async function handleSync() {
    setState({ kind: "running" });
    try {
      const res = await fetch("/admin/api/ads/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setState({
          kind: "error",
          message: errorMessage(res.status, json?.error),
        });
        return;
      }
      setState({ kind: "done", message: summarizeSync(json.data.results) });
      onSynced();
    } catch (err) {
      console.error("[ads] sync error:", err);
      setState({ kind: "error", message: SYNC_FAILED });
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button
        size="sm"
        onClick={handleSync}
        disabled={running}
        aria-busy={running}
      >
        <RefreshCw
          className={cn("w-4 h-4", running && "animate-spin")}
          aria-hidden="true"
        />
        {running ? "同期中…" : "今すぐ同期（直近7日）"}
      </Button>
      {state.kind === "done" && (
        <p
          role="status"
          className="flex items-center gap-1 text-sm text-emerald-700"
        >
          <CircleCheck className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      )}
      {state.kind === "error" && (
        <p
          role="alert"
          className="flex items-center gap-1 text-sm text-red-700"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      )}
    </div>
  );
}
