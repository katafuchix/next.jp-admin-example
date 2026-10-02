import { addDays, isDayKey, spanDays } from "@/lib/jst-date";
import type { DayRange } from "@/lib/ad-sources/types";

export type DayRangeResult =
  { ok: true; range: DayRange } | { ok: false; error: string };

/**
 * 画面・API から渡された期間（JST の YYYY-MM-DD、両端を含む）を検査して確定する。
 * 省略時は「昨日までの defaultSpanDays 日間」。
 */
export function resolveDayRange({
  from,
  to,
  today,
  defaultSpanDays,
  maxSpanDays,
  allowFuture = true,
}: {
  from?: string | null;
  to?: string | null;
  today: string;
  defaultSpanDays: number;
  maxSpanDays: number;
  /** false なら終了日が今日より後の指定を弾く */
  allowFuture?: boolean;
}): DayRangeResult {
  const end = to || addDays(today, -1);
  const start = from || addDays(end, -(defaultSpanDays - 1));

  if (!isDayKey(start) || !isDayKey(end)) {
    return { ok: false, error: "期間は YYYY-MM-DD の形式で指定してください" };
  }
  if (start > end) {
    return { ok: false, error: "開始日は終了日以前にしてください" };
  }
  if (!allowFuture && end > today) {
    return { ok: false, error: "終了日は今日以前にしてください" };
  }
  if (spanDays(start, end) > maxSpanDays) {
    return {
      ok: false,
      error: `期間は${maxSpanDays}日以内で指定してください`,
    };
  }
  return { ok: true, range: { from: start, to: end } };
}
