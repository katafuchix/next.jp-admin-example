"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, CircleCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdSourceId } from "@/lib/ad-sources/types";
import { summarizeImport } from "./format";

const IMPORT_FAILED = "CSV の取り込みに失敗しました";
/** サーバー側の上限と同じ。超えるファイルは送る前に断る */
const MAX_CSV_BYTES = 512 * 1024;

type ImportState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

function errorMessage(status: number, error: unknown): string {
  if (status === 401) return "ログインし直してください";
  if (status === 403) return "CSV を取り込む権限がありません";
  return typeof error === "string" && error ? error : IMPORT_FAILED;
}

/**
 * 媒体の管理画面の CSV を選んで取り込む。
 * 取り込んだ期間を伝えて onImported で表を取り直す。
 */
export function CsvImportButton({
  source,
  onImported,
}: {
  source: { id: AdSourceId; label: string };
  onImported: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ kind: "idle" });
  const running = state.kind === "running";

  async function upload(file: File) {
    if (file.size > MAX_CSV_BYTES) {
      setState({ kind: "error", message: "CSV は 512KB 以下にしてください" });
      return;
    }
    setState({ kind: "running" });
    const body = new FormData();
    body.set("source", source.id);
    body.set("file", file);
    try {
      const res = await fetch("/admin/api/ads/import", {
        method: "POST",
        body,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setState({
          kind: "error",
          message: errorMessage(res.status, json?.error),
        });
        return;
      }
      setState({ kind: "done", message: summarizeImport(json.data) });
      onImported();
    } catch (err) {
      console.error("[ads] csv import error:", err);
      setState({ kind: "error", message: IMPORT_FAILED });
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 同じファイルを選び直しても change が起きるように空へ戻す
    e.target.value = "";
    if (file) void upload(file);
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        aria-label={`${source.label} の CSV ファイル`}
        onChange={handleChange}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={running}
        aria-busy={running}
      >
        <Upload className="w-4 h-4" aria-hidden="true" />
        {running ? (
          "取り込み中…"
        ) : (
          <>
            {/* 行の中に置くので見た目は短く、読み上げでは媒体名から伝える */}
            <span className="sr-only">{`${source.label} の`}</span>
            {" CSV を取り込む"}
          </>
        )}
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
