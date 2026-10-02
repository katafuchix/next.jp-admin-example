import type { Connection } from "mongoose";
import { addDays, jstDayKey, jstDayStart } from "@/lib/jst-date";
import { getAppUserModel } from "@/models/AppUser";
import { getAppUserWithdrawalModel } from "@/models/AppUserWithdrawal";
import { getDashboardStatsModel } from "@/models/DashboardStats";
import {
  buildSignupHeatmap,
  computeRetention,
  fillDailySeries,
  ratio,
  RETENTION_DAYS,
  type DailyCount,
  type RetentionPoint,
} from "./compute";

export interface MetricsRange {
  from: string;
  to: string;
  /** 今日（JST）。継続率で「まだ終わっていない日」を外すのに使う */
  today: string;
}

interface Rate {
  paid: number;
  total: number;
  rate: number | null;
}

/** 期間内の退会数（退会の記録を始めた日より前の退会は数えられない） */
interface Withdrawals {
  total: number;
  fromApp: number;
  fromAdmin: number;
  /** 最初の記録の日（JST）。まだ1件も無ければ null */
  recordedSince: string | null;
}

export interface UserMetrics {
  range: MetricsRange;
  activity: {
    dau: DailyCount[];
    /** 期間の平均 DAU */
    avgDau: number;
    /** 終了日までの直近7日のユニーク数 */
    wau: number;
    /** 終了日までの直近30日のユニーク数 */
    mau: number;
    /** 期間中に1日でも使ったユーザー数 */
    activeUsers: number;
    /** 期間の延べアクティブ日数（1人1日1回） */
    totalLogins: number;
  };
  retention: RetentionPoint[];
  users: {
    /** 終了日時点の登録ユーザー数（退会済みは含まない） */
    total: number;
    newUsers: number;
    withdrawals: Withdrawals;
    /** 期間内の登録を JST の曜日（月〜日）× 時で数えた表 */
    signupHeatmap: number[][];
  };
  paidRate: {
    /** 現在の課金率（isPaid は現在の状態しか持たないため期間に依らない） */
    overall: Rate;
    /** 期間内に登録したユーザーのうち、現在課金中の割合 */
    cohort: Rate;
  };
}

const TIMEZONE = "Asia/Tokyo";

function jstRange(fromKey: string, toKey: string) {
  return { $gte: jstDayStart(fromKey), $lt: jstDayStart(addDays(toKey, 1)) };
}

function uniqueUsersBetween(fromKey: string, toKey: string) {
  return [
    { $match: { "_id.day": { $gte: fromKey, $lte: toKey } } },
    { $group: { _id: "$_id.userId" } },
    { $count: "n" },
  ];
}

interface ActivityFacet {
  daily: { _id: string; count: number }[];
  period: { n: number }[];
  wau: { n: number }[];
  mau: { n: number }[];
}

/** DAU・WAU・MAU・期間アクティブ数を dashboardstats の1回の走査でまとめて出す */
async function fetchActivity(conn: Connection, range: MetricsRange) {
  const { from, to } = range;
  const mauFrom = addDays(to, -29);
  const scanFrom = mauFrom < from ? mauFrom : from;

  const [facet] = await getDashboardStatsModel(conn).aggregate<ActivityFacet>([
    { $match: { date: jstRange(scanFrom, to) } },
    {
      // 一意キーは userId + date だが、日付の保存方法が変わった日に同じ JST の日で
      // 2行できていても1人1日として数える
      $group: {
        _id: {
          day: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$date",
              timezone: TIMEZONE,
            },
          },
          userId: "$userId",
        },
      },
    },
    {
      $facet: {
        daily: [
          { $match: { "_id.day": { $gte: from, $lte: to } } },
          { $group: { _id: "$_id.day", count: { $sum: 1 } } },
        ],
        period: uniqueUsersBetween(from, to),
        wau: uniqueUsersBetween(addDays(to, -6), to),
        mau: uniqueUsersBetween(mauFrom, to),
      },
    },
  ]);

  const dau = fillDailySeries(
    from,
    to,
    (facet?.daily ?? []).map((r) => ({ day: r._id, count: r.count })),
  );
  const totalLogins = dau.reduce((sum, d) => sum + d.count, 0);
  return {
    dau,
    avgDau: dau.length > 0 ? totalLogins / dau.length : 0,
    wau: facet?.wau[0]?.n ?? 0,
    mau: facet?.mau[0]?.n ?? 0,
    activeUsers: facet?.period[0]?.n ?? 0,
    totalLogins,
  };
}

/** 期間内に登録したユーザーの継続率（登録翌日〜昨日の利用記録だけを読む） */
async function fetchRetention(
  conn: Connection,
  cohort: { userId: string; signupDay: string }[],
  range: MetricsRange,
): Promise<RetentionPoint[]> {
  const readFrom = addDays(range.from, 1);
  const lastDay = addDays(range.to, Math.max(...RETENTION_DAYS));
  const yesterday = addDays(range.today, -1);
  const readTo = lastDay < yesterday ? lastDay : yesterday;

  if (cohort.length === 0 || readTo < readFrom) {
    return computeRetention(cohort, [], range.today);
  }

  const rows = await getDashboardStatsModel(conn)
    .find({
      userId: { $in: cohort.map((u) => u.userId) },
      date: jstRange(readFrom, readTo),
    })
    .select("userId date")
    .lean();
  const activity = rows.map((r) => ({
    userId: String(r.userId),
    day: jstDayKey(new Date(r.date)),
  }));
  return computeRetention(cohort, activity, range.today);
}

/** 期間内の退会を経路（アプリ／管理画面）別に数える */
async function fetchWithdrawals(
  conn: Connection,
  range: MetricsRange,
): Promise<Withdrawals> {
  const Withdrawal = getAppUserWithdrawalModel(conn);
  const [bySource, first] = await Promise.all([
    Withdrawal.aggregate<{ _id: string; n: number }>([
      { $match: { withdrawnAt: jstRange(range.from, range.to) } },
      { $group: { _id: "$source", n: { $sum: 1 } } },
    ]),
    Withdrawal.findOne().sort({ withdrawnAt: 1 }).select("withdrawnAt").lean(),
  ]);

  const count = (source: string) =>
    bySource.find((r) => r._id === source)?.n ?? 0;
  return {
    total: bySource.reduce((sum, r) => sum + r.n, 0),
    fromApp: count("app"),
    fromAdmin: count("admin"),
    recordedSince: first ? jstDayKey(new Date(first.withdrawnAt)) : null,
  };
}

/** 今の課金中ユーザー数と総ユーザー数（isPaid は今の状態しか無いので、期間では絞れない） */
export async function countPaidUsers(
  conn: Connection,
): Promise<{ paid: number; total: number }> {
  const User = getAppUserModel(conn);
  const [paid, total] = await Promise.all([
    User.countDocuments({ isPaid: true }),
    User.countDocuments({}),
  ]);
  return { paid, total };
}

export async function fetchUserMetrics(
  conn: Connection,
  range: MetricsRange,
): Promise<UserMetrics> {
  const User = getAppUserModel(conn);

  const [activity, signups, total, paidNow, withdrawals] = await Promise.all([
    fetchActivity(conn, range),
    User.find({ createdAt: jstRange(range.from, range.to) })
      .select("_id createdAt isPaid")
      .lean(),
    // createdAt の無い古い行も「終了日以前」として数える
    User.countDocuments({
      createdAt: { $not: { $gte: jstDayStart(addDays(range.to, 1)) } },
    }),
    countPaidUsers(conn),
    fetchWithdrawals(conn, range),
  ]);

  const createdAts = signups
    .filter((u) => u.createdAt)
    .map((u) => new Date(u.createdAt as Date));
  const cohort = signups
    .filter((u) => u.createdAt)
    .map((u) => ({
      userId: String(u._id),
      signupDay: jstDayKey(new Date(u.createdAt as Date)),
    }));
  const cohortPaid = signups.filter((u) => u.isPaid === true).length;

  return {
    range,
    activity,
    retention: await fetchRetention(conn, cohort, range),
    users: {
      total,
      newUsers: signups.length,
      withdrawals,
      signupHeatmap: buildSignupHeatmap(createdAts),
    },
    paidRate: {
      overall: {
        paid: paidNow.paid,
        total: paidNow.total,
        rate: ratio(paidNow.paid, paidNow.total),
      },
      cohort: {
        paid: cohortPaid,
        total: signups.length,
        rate: ratio(cohortPaid, signups.length),
      },
    },
  };
}
