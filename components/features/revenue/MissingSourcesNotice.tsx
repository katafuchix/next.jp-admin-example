import { Info } from "lucide-react";
import type { MonthlyRevenue, SourceRef } from "@/lib/revenue-monthly";

const GROUP_LABELS = {
  charge: "課金の手取り",
  ad: "広告収益",
  cost: "広告費",
} as const;

/** まだつながっていない媒体の案内。全部つながっていれば何も出さない */
export function MissingSourcesNotice({
  missing,
}: {
  missing: MonthlyRevenue["missing"];
}) {
  const groups = (
    Object.entries(missing) as [keyof typeof GROUP_LABELS, SourceRef[]][]
  ).filter(([, sources]) => sources.length > 0);
  if (groups.length === 0) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 leading-normal"
    >
      <Info
        className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-500"
        aria-hidden="true"
      />
      <div className="text-sm space-y-1">
        <p className="font-medium text-slate-900">
          まだ取り込めていない媒体があります
        </p>
        <ul className="space-y-0.5">
          {groups.map(([group, sources]) => (
            <li key={group}>
              {GROUP_LABELS[group]}：{sources.map((s) => s.label).join("、")}
            </li>
          ))}
        </ul>
        <p className="text-slate-500">
          該当する欄は「—」で表示しています。粗利は6媒体すべてがつながってから表示します（一部の媒体だけで差し引くと、実態と違う赤字・黒字に見えるため）。
        </p>
      </div>
    </div>
  );
}
