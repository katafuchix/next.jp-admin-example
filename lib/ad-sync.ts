import { isDayKey } from "@/lib/jst-date";
import { missingEnv } from "@/lib/ad-sources/registry";
import {
  AD_METRIC_KEYS,
  AdSourceError,
  type AdDailyRow,
  type AdSource,
  type AdSourceId,
  type DayRange,
  type Env,
} from "@/lib/ad-sources/types";

/**
 * 広告・売上の媒体から日次データを取り込み、管理画面DBへ保存する。
 * 直近の数日を毎回取り直して上書きする（概算値が後から確定値に変わる媒体があるため）。
 * 取れなかった媒体はモックで埋めず「失敗」「スキップ」として履歴に残す。
 */

/** cron・manual は API からの同期、csv は管理画面の CSV を画面から取り込んだもの */
export type AdSyncTrigger = "cron" | "manual" | "csv";
export type AdSyncStatus = "success" | "failed" | "skipped";

export interface AdSyncRunRecord {
  source: AdSourceId;
  trigger: AdSyncTrigger;
  status: AdSyncStatus;
  from: string;
  to: string;
  rowCount: number;
  message: string | null;
  startedAt: Date;
  finishedAt: Date;
}

export interface AdSyncResult {
  source: AdSourceId;
  label: string;
  status: AdSyncStatus;
  rowCount: number;
  message: string | null;
}

export interface AdSyncStore {
  /** 媒体・日付・キーで一意に上書き保存する。fetchedAt はこの回の目印 */
  upsertDaily(
    source: AdSourceId,
    rows: AdDailyRow[],
    fetchedAt: Date,
  ): Promise<void>;
  /** 期間内で今回の取得に含まれなかった（fetchedAt が古い）行を消し、消した件数を返す */
  removeStale(
    source: AdSourceId,
    range: DayRange,
    fetchedAt: Date,
  ): Promise<number>;
  recordRun(run: AdSyncRunRecord): Promise<void>;
}

const UNKNOWN_FAILURE =
  "取得に失敗しました（詳しい理由はサーバーのログにあります）";

/** 取得結果を保存前に検査する。1行でもおかしければ媒体ごと失敗にする */
function validateRows(rows: AdDailyRow[], range: DayRange): void {
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const at = `${i + 1}行目`;
    if (!isDayKey(row.date)) {
      throw new AdSourceError(`日付の形式が違います（${at}: ${row.date}）`);
    }
    if (row.date < range.from || row.date > range.to) {
      throw new AdSourceError(`期間外の日付があります（${at}: ${row.date}）`);
    }
    if (!row.key?.trim()) {
      throw new AdSourceError(`キーが空です（${at}）`);
    }
    for (const name of AD_METRIC_KEYS) {
      const value = row.metrics[name];
      if (value !== undefined && !Number.isFinite(value)) {
        throw new AdSourceError(`${name} が数値ではありません（${at}）`);
      }
    }
    const id = `${row.date} / ${row.key}`;
    if (seen.has(id)) {
      throw new AdSourceError(
        `同じ日付・キーの行が重複しています（${at}: ${id}）`,
      );
    }
    seen.add(id);
  });
}

async function syncOne(
  source: AdSource,
  range: DayRange,
  env: Env,
  store: AdSyncStore,
  fetchedAt: Date,
): Promise<Pick<AdSyncResult, "status" | "rowCount" | "message">> {
  const missing = missingEnv(source, env);
  if (missing.length > 0) {
    return {
      status: "skipped",
      rowCount: 0,
      message: `認証情報が未設定です（${missing.join("・")}）`,
    };
  }
  if (!source.fetchDaily) {
    return {
      status: "skipped",
      rowCount: 0,
      message: "取得処理がまだ実装されていません",
    };
  }

  try {
    const rows = await source.fetchDaily(range, env);
    validateRows(rows, range);
    await store.upsertDaily(source.id, rows, fetchedAt);
    await store.removeStale(source.id, range, fetchedAt);
    return { status: "success", rowCount: rows.length, message: null };
  } catch (err) {
    console.error("[ad-sync] 取り込みに失敗しました", {
      source: source.id,
      range,
      err,
    });
    return {
      status: "failed",
      rowCount: 0,
      message: err instanceof AdSourceError ? err.message : UNKNOWN_FAILURE,
    };
  }
}

export async function runAdSync({
  sources,
  range,
  trigger,
  env,
  store,
  now = () => new Date(),
}: {
  sources: readonly AdSource[];
  range: DayRange;
  trigger: AdSyncTrigger;
  env: Env;
  store: AdSyncStore;
  now?: () => Date;
}): Promise<AdSyncResult[]> {
  return Promise.all(
    sources.map(async (source) => {
      const startedAt = now();
      const outcome = await syncOne(source, range, env, store, startedAt);
      try {
        await store.recordRun({
          source: source.id,
          trigger,
          ...outcome,
          from: range.from,
          to: range.to,
          startedAt,
          finishedAt: now(),
        });
      } catch (err) {
        console.error("[ad-sync] 同期履歴を記録できませんでした", {
          source: source.id,
          err,
        });
      }
      return { source: source.id, label: source.label, ...outcome };
    }),
  );
}

export interface AdImportResult {
  source: AdSourceId;
  label: string;
  /** 行の日付の最初〜最後。この期間は今回の行で置き換わる */
  range: DayRange;
  rowCount: number;
}

/**
 * 媒体の管理画面の CSV を読んだ行を、画面からまとめて取り込む。
 * 行の日付の最初〜最後を「今回取り直した期間」とみなし、その期間で今回に含まれない古い行を片付ける。
 * 行がおかしければ AdSourceError で止め、何も保存しない（理由はその場で画面に出すので履歴にも残さない）。
 * 履歴の成功が無いと広告収益に数えられないので、記録の失敗も取り込みの失敗として投げる。
 */
export async function importAdRows({
  source,
  rows,
  store,
  now = () => new Date(),
}: {
  source: AdSource;
  rows: AdDailyRow[];
  store: AdSyncStore;
  now?: () => Date;
}): Promise<AdImportResult> {
  if (rows.length === 0) {
    throw new AdSourceError("取り込める行がありません");
  }
  const dates = rows.map((row) => row.date).sort();
  const range = { from: dates[0], to: dates[dates.length - 1] };
  validateRows(rows, range);

  const startedAt = now();
  await store.upsertDaily(source.id, rows, startedAt);
  await store.removeStale(source.id, range, startedAt);
  await store.recordRun({
    source: source.id,
    trigger: "csv",
    status: "success",
    from: range.from,
    to: range.to,
    rowCount: rows.length,
    message: null,
    startedAt,
    finishedAt: now(),
  });
  return { source: source.id, label: source.label, range, rowCount: rows.length };
}
