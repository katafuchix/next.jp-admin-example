import { jstDayKey } from "@/lib/jst-date";
import { PaidRateSnapshot } from "@/models/PaidRateSnapshot";

export interface PaidCounts {
  paid: number;
  total: number;
}

export interface PaidRateSnapshotRecord extends PaidCounts {
  /** JST の日付 YYYY-MM-DD */
  date: string;
  recordedAt: Date;
}

export interface PaidRateSnapshotStore {
  upsert(snapshot: PaidRateSnapshotRecord): Promise<void>;
}

export type PaidRateSnapshotResult =
  | ({ status: "recorded"; date: string } & PaidCounts)
  | { status: "skipped" | "failed"; message: string };

const APP_DB_MISSING = "アプリDBが未設定のため課金率を記録していません";
const RECORD_FAILED = "課金率の記録に失敗しました";

/**
 * 今の課金率（課金中 ÷ 総ユーザー）の材料を、JST の今日の1行として残す。
 * 同じ日に何度呼んでも1行で、最後に呼んだときの値になる。
 * 広告の同期と一緒に呼ぶので、失敗しても例外は投げない（同期を止めない）。
 */
export async function recordPaidRateSnapshot({
  countUsers,
  store,
  now,
}: {
  /** アプリDBが未設定なら null */
  countUsers: () => Promise<PaidCounts | null>;
  store: PaidRateSnapshotStore;
  now: Date;
}): Promise<PaidRateSnapshotResult> {
  try {
    const counts = await countUsers();
    if (!counts) return { status: "skipped", message: APP_DB_MISSING };

    const date = jstDayKey(now);
    await store.upsert({ date, ...counts, recordedAt: now });
    return { status: "recorded", date, ...counts };
  } catch (err) {
    console.error("[paid-snapshot] 課金率の記録に失敗しました", { now, err });
    return { status: "failed", message: RECORD_FAILED };
  }
}

/** 管理画面DB（connectDB 済みの既定の接続）に保存する */
export function createMongoPaidRateSnapshotStore(): PaidRateSnapshotStore {
  return {
    async upsert({ date, paid, total, recordedAt }) {
      await PaidRateSnapshot.updateOne(
        { date },
        { $set: { paid, total, recordedAt } },
        { upsert: true },
      );
    },
  };
}
