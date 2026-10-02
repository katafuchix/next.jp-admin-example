import type { AdSourceOverview } from "@/lib/ad-sources/overview";
import type { AdSourceId } from "@/lib/ad-sources/types";

/** 取り込み状況の表で、媒体をまとめる用途（上から順に出す） */
export const SOURCE_GROUPS = [
  { key: "acquisition", label: "広告費・インストール" },
  { key: "ad-revenue", label: "広告収益" },
  { key: "sales", label: "アプリ内課金" },
] as const;

type SourceGroupKey = (typeof SOURCE_GROUPS)[number]["key"];

// Record にしておくと、媒体を足したときに用途を決め忘れると型検査で落ちる
const GROUP_OF: Record<AdSourceId, SourceGroupKey> = {
  tenjin: "acquisition",
  smaad_spend: "acquisition",
  admob: "ad-revenue",
  adgeneration: "ad-revenue",
  smaad: "ad-revenue",
  appstore: "sales",
  googleplay: "sales",
};

/** 媒体を用途ごとにまとめる。用途の中は媒体一覧の順のまま、媒体が無い用途は出さない */
export function groupSources(sources: AdSourceOverview[]) {
  return SOURCE_GROUPS.map((g) => ({
    ...g,
    sources: sources.filter((s) => GROUP_OF[s.id] === g.key),
  })).filter((g) => g.sources.length > 0);
}
