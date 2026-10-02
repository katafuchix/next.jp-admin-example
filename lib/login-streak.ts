/**
 * ログインボーナス日境界（JST 4:00）に基づく日付キー（YYYY-MM-DD、JST基準）を返す。
 * care/server/utils/dateUtils.ts の getJSTLoginBonusDayRange と同じ境界（4時未満は前日扱い）に揃えている。
 */
export function getLoginDayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const y = get("year");
  const mo = get("month");
  const d = get("day");
  const h = get("hour");

  const day = new Date(Date.UTC(y, mo - 1, d));
  if (h < 4) {
    day.setUTCDate(day.getUTCDate() - 1);
  }
  return day.toISOString().slice(0, 10);
}

export interface LoginStreakInfo {
  /** 直近ログイン日から遡って連続している日数（ログイン記録が無ければ0） */
  currentStreakDays: number;
  /** 直近ログイン日（JST日付キー、YYYY-MM-DD）。記録が無ければ null */
  lastLoginDayKey: string | null;
}

/**
 * ログイン日時の一覧から、直近ログイン日を起点に何日連続でログインしているかを計算する。
 */
export function computeLoginStreak(loginDates: Date[]): LoginStreakInfo {
  const dayKeys = new Set(loginDates.map(getLoginDayKey));
  if (dayKeys.size === 0) {
    return { currentStreakDays: 0, lastLoginDayKey: null };
  }

  const sortedKeys = Array.from(dayKeys).sort();
  const lastLoginDayKey = sortedKeys[sortedKeys.length - 1];

  let streakDays = 1;
  let cursor = new Date(`${lastLoginDayKey}T00:00:00Z`);
  for (let i = sortedKeys.length - 2; i >= 0; i--) {
    const prevDay = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    const prevDayKey = prevDay.toISOString().slice(0, 10);
    if (sortedKeys[i] !== prevDayKey) break;
    streakDays += 1;
    cursor = prevDay;
  }

  return { currentStreakDays: streakDays, lastLoginDayKey };
}
