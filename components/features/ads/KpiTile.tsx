"use client";

import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KpiNote } from "./format";

/** 指標1つ。足りない媒体があるときは、色だけでなくアイコンと文言で知らせる */
export function KpiTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: KpiNote;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="rounded-lg bg-slate-50 p-3 sm:p-4"
    >
      <p className="text-xs font-medium text-slate-500 leading-tight">
        {label}
      </p>
      <p className="mt-2 text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
        {value}
      </p>
      <p
        className={cn(
          "mt-1 flex items-start gap-1 text-xs leading-snug",
          note.warning ? "text-amber-700" : "text-slate-500",
        )}
      >
        {note.warning && (
          <AlertCircle
            className="w-3.5 h-3.5 mt-px flex-shrink-0"
            aria-hidden="true"
          />
        )}
        <span>{note.text}</span>
      </p>
    </div>
  );
}
