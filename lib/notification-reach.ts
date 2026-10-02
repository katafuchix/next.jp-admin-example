import type { Connection } from "mongoose";
import { getAppUserModel } from "@/models/AppUser";

/**
 * アプリ（care）の server/services/fcmTopicSyncService.ts と同じ区切り。
 * 直近30日以内にアプリを開いた人を「アクティブ」とする。
 */
const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type ReachSegment = "all" | "active" | "inactive" | "premium";

export type ReachCounts = Record<ReachSegment, number>;

const SEGMENTS: ReachSegment[] = ["all", "active", "inactive", "premium"];

/**
 * 通知が届く人の条件。アプリは受け取り先の端末（fcmTokens）を登録した人だけを
 * 配信先のトピックに入れるので、端末が1つも無い人は数えない。
 * 知らない区分は、送信側（SEGMENT_TOPIC_MAP）と同じく全体として扱う。
 */
export function reachFilter(
  segment: string,
  now: Date,
): Record<string, unknown> {
  const hasToken = { "fcmTokens.0": { $exists: true } };
  const cutoff = new Date(now.getTime() - ACTIVE_WINDOW_MS);

  switch (segment) {
    case "active":
      return { ...hasToken, lastAppOpenAt: { $gt: cutoff } };
    case "inactive":
      return {
        ...hasToken,
        $or: [{ lastAppOpenAt: { $lte: cutoff } }, { lastAppOpenAt: null }],
      };
    case "premium":
      return { ...hasToken, isPaid: true };
    default:
      return hasToken;
  }
}

/** その区分に通知を送ったときに届く人数（端末の数ではなく人数）。読むだけ */
export async function countReach(
  conn: Connection,
  segment: string,
  now: Date,
): Promise<number> {
  return getAppUserModel(conn).countDocuments(reachFilter(segment, now));
}

export async function countReachBySegment(
  conn: Connection,
  now: Date,
): Promise<ReachCounts> {
  const counts = await Promise.all(
    SEGMENTS.map((segment) => countReach(conn, segment, now)),
  );
  return Object.fromEntries(
    SEGMENTS.map((segment, i) => [segment, counts[i]]),
  ) as ReachCounts;
}
