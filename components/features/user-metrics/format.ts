import { addDays, isDayKey, jstDayKey, spanDays } from "@/lib/jst-date";

export const PRESET_DAYS = [7, 30, 90] as const;
const MAX_SPAN_DAYS = 366;

/** 0〜1 の割合を「12.3%」にする。分母が無い（null）ときは「—」 */
export function formatPercent(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

/** YYYY-MM-DD を「9月3日」にする */
export function formatDayLabel(key: string): string {
  return `${Number(key.slice(5, 7))}月${Number(key.slice(8, 10))}日`;
}

/** 昨日（JST）までの N 日間。今日はまだ終わっていないので含めない */
export function presetRange(days: number, now = new Date()) {
  const to = addDays(jstDayKey(now), -1);
  return { from: addDays(to, -(days - 1)), to };
}

/** API と同じ条件で期間を確かめる。問題なければ null */
export function validateRange(from: string, to: string): string | null {
  if (!isDayKey(from) || !isDayKey(to)) {
    return "開始日と終了日を入力してください";
  }
  if (from > to) return "開始日は終了日以前にしてください";
  if (spanDays(from, to) > MAX_SPAN_DAYS) {
    return `期間は${MAX_SPAN_DAYS}日以内で指定してください`;
  }
  return null;
}
