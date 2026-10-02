import { addDays, JST_OFFSET_MS, listDayKeys } from "@/lib/jst-date";

export interface DailyCount {
  day: string;
  count: number;
}

export interface RetentionPoint {
  /** 登録から何日目か（D1 / D7 / D30） */
  day: number;
  /** N 日目が終わっている登録ユーザー数（分母） */
  eligible: number;
  /** そのうち N 日目にアクティブだった人数 */
  retained: number;
  rate: number | null;
}

export const RETENTION_DAYS = [1, 7, 30] as const;

/** ヒートマップの行の並び（月曜始まり） */
export const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

/** 分母が 0 のときは「0%」ではなく「データなし」を表す null を返す */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** 期間内の全日を並べ、記録の無い日を 0 で埋める */
export function fillDailySeries(
  fromKey: string,
  toKey: string,
  rows: DailyCount[],
): DailyCount[] {
  const counts = new Map(rows.map((r) => [r.day, r.count]));
  return listDayKeys(fromKey, toKey).map((day) => ({
    day,
    count: counts.get(day) ?? 0,
  }));
}

/**
 * 登録日コホートの継続率。登録日から「ちょうど N 日目」にアクティブだった割合。
 * N 日目が今日以降のユーザーは結果が確定していないので分母から外す。
 */
export function computeRetention(
  cohort: { userId: string; signupDay: string }[],
  activity: { userId: string; day: string }[],
  todayKey: string,
  offsets: readonly number[] = RETENTION_DAYS,
): RetentionPoint[] {
  const active = new Set(activity.map((a) => `${a.userId}|${a.day}`));
  return offsets.map((n) => {
    const eligible = cohort.filter((u) => addDays(u.signupDay, n) < todayKey);
    const retained = eligible.filter((u) =>
      active.has(`${u.userId}|${addDays(u.signupDay, n)}`),
    ).length;
    return {
      day: n,
      eligible: eligible.length,
      retained,
      rate: ratio(retained, eligible.length),
    };
  });
}

/** 登録日時を JST の曜日（月〜日）× 時（0〜23）の件数表にする */
export function buildSignupHeatmap(createdAts: Date[]): number[][] {
  const matrix = WEEKDAY_LABELS.map(() => Array<number>(24).fill(0));
  for (const createdAt of createdAts) {
    // JST の時刻を UTC の欄で読むために 9 時間ずらす
    const jst = new Date(createdAt.getTime() + JST_OFFSET_MS);
    // getUTCDay は 0 = 日曜。月曜始まりの行番号へ直す
    const row = (jst.getUTCDay() + 6) % 7;
    matrix[row][jst.getUTCHours()] += 1;
  }
  return matrix;
}
