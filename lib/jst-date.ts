/**
 * 日本時間（JST）の「日」を "YYYY-MM-DD" の文字列キーで扱うための関数群。
 * care は JST 0 時（= UTC 前日 15 時）を1日の境界として `dashboardstats.date` を保存しているので、
 * 集計の期間もこの境界で切る。
 */

export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 日付キーを「その日の JST 0 時」の Date にする */
export function jstDayStart(key: string): Date {
  return new Date(Date.parse(`${key}T00:00:00.000Z`) - JST_OFFSET_MS);
}

/** Date が属する JST の日付キーを返す */
export function jstDayKey(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** 両端を含む日数 */
export function spanDays(fromKey: string, toKey: string): number {
  return (
    Math.round(
      (Date.parse(`${toKey}T00:00:00.000Z`) -
        Date.parse(`${fromKey}T00:00:00.000Z`)) /
        DAY_MS,
    ) + 1
  );
}

/** 開始日から終了日まで（両端を含む）の日付キーを並べる */
export function listDayKeys(fromKey: string, toKey: string): string[] {
  const count = spanDays(fromKey, toKey);
  return Array.from({ length: Math.max(count, 0) }, (_, i) =>
    addDays(fromKey, i),
  );
}

export function isDayKey(value: string): boolean {
  if (!DAY_KEY_PATTERN.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}
