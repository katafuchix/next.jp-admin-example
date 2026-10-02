import type { Connection } from "mongoose";
import { addDays, jstDayStart } from "@/lib/jst-date";
import { getAppUserModel } from "@/models/AppUser";
import { getBuddyPointLogModel } from "@/models/BuddyPointLog";
import { pointSourceLabel } from "./labels";

/** 直近の記録として返す件数 */
export const RECENT_LIMIT = 50;

type PointType = "earn" | "spend";

export interface PointSourceRow {
  type: PointType;
  source: string;
  label: string;
  count: number;
  /** 付与・消費とも正の数 */
  points: number;
  users: number;
}

export interface RecentPointLog {
  id: string;
  createdAt: string;
  userId: string;
  userName: string;
  type: PointType;
  source: string;
  label: string;
  /** アプリの記録どおり（消費はマイナス） */
  amount: number;
  balanceAfter: number;
}

export interface AppPointStats {
  range: { from: string; to: string };
  totals: {
    earned: number;
    earnCount: number;
    spent: number;
    spendCount: number;
    /** 期間中にポイントの動きがあった人数 */
    users: number;
  };
  /** 今の残高（期間に依らない）。holders は残高が1以上の人数 */
  balance: { total: number; holders: number };
  bySource: PointSourceRow[];
  recent: RecentPointLog[];
}

interface SourceGroup {
  _id: { type: PointType; source: string };
  count: number;
  points: number;
  users: number;
}

const UNKNOWN_USER = "（不明なユーザー）";

function sumBy(rows: PointSourceRow[], type: PointType) {
  const own = rows.filter((r) => r.type === type);
  return {
    points: own.reduce((s, r) => s + r.points, 0),
    count: own.reduce((s, r) => s + r.count, 0),
  };
}

/** アプリ（care）の buddypointlogs を JST の期間で集計する。読むだけ */
export async function fetchAppPointStats(
  conn: Connection,
  range: { from: string; to: string },
): Promise<AppPointStats> {
  const BuddyPointLog = getBuddyPointLogModel(conn);
  const AppUser = getAppUserModel(conn);
  const createdAt = {
    $gte: jstDayStart(range.from),
    $lt: jstDayStart(addDays(range.to, 1)),
  };

  const [[facets], [balance], logs] = await Promise.all([
    BuddyPointLog.aggregate<{
      bySource: SourceGroup[];
      users: { n: number }[];
    }>([
      { $match: { createdAt } },
      {
        $facet: {
          bySource: [
            {
              $group: {
                _id: { type: "$type", source: "$source" },
                count: { $sum: 1 },
                points: { $sum: { $abs: "$amount" } },
                userIds: { $addToSet: "$userId" },
              },
            },
            {
              $project: { count: 1, points: 1, users: { $size: "$userIds" } },
            },
          ],
          users: [{ $group: { _id: "$userId" } }, { $count: "n" }],
        },
      },
    ]),
    AppUser.aggregate<{ total: number; holders: number }>([
      {
        $group: {
          _id: null,
          total: { $sum: "$buddyPoints" },
          holders: { $sum: { $cond: [{ $gt: ["$buddyPoints", 0] }, 1, 0] } },
        },
      },
    ]),
    BuddyPointLog.find({ createdAt })
      .sort({ createdAt: -1 })
      .limit(RECENT_LIMIT)
      .lean(),
  ]);

  const bySource = (facets?.bySource ?? [])
    .map((g) => ({
      type: g._id.type,
      source: g._id.source,
      label: pointSourceLabel(g._id.source),
      count: g.count,
      points: g.points,
      users: g.users,
    }))
    .sort((a, b) =>
      a.type === b.type ? b.points - a.points : a.type === "earn" ? -1 : 1,
    );
  const earn = sumBy(bySource, "earn");
  const spend = sumBy(bySource, "spend");

  const userIds = [...new Set(logs.map((l) => String(l.userId)))];
  const users =
    userIds.length === 0
      ? []
      : await AppUser.find(
          { _id: { $in: userIds } },
          { displayName: 1, email: 1 },
        ).lean();
  const names = new Map(
    users.map((u) => [String(u._id), u.displayName || u.email || UNKNOWN_USER]),
  );

  return {
    range: { from: range.from, to: range.to },
    totals: {
      earned: earn.points,
      earnCount: earn.count,
      spent: spend.points,
      spendCount: spend.count,
      users: facets?.users[0]?.n ?? 0,
    },
    balance: { total: balance?.total ?? 0, holders: balance?.holders ?? 0 },
    bySource,
    recent: logs.map((l) => ({
      id: String(l._id),
      createdAt: new Date(l.createdAt).toISOString(),
      userId: String(l.userId),
      userName: names.get(String(l.userId)) ?? UNKNOWN_USER,
      type: l.type,
      source: l.source,
      label: pointSourceLabel(l.source),
      amount: l.amount,
      balanceAfter: l.balanceAfter,
    })),
  };
}
