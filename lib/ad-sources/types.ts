/**
 * 広告・売上の取り込み元（媒体）の共通の型。
 * 媒体ごとの取得処理は「JST の日 × キー（キャンペーン・広告枠・商品など）」の行を返し、
 * 同期処理（lib/ad-sync.ts）が管理画面DBへ保存する。
 */

export const AD_SOURCE_IDS = [
  "tenjin",
  "smaad_spend",
  "admob",
  "adgeneration",
  "smaad",
  "appstore",
  "googleplay",
] as const;

export type AdSourceId = (typeof AD_SOURCE_IDS)[number];

export const AD_METRIC_KEYS = [
  /** 広告費（円） */
  "spend",
  /** 広告経由のインストール数 */
  "installs",
  /** 広告収益（円） */
  "revenue",
  "impressions",
  "clicks",
  /** 成果件数（オファーウォールの達成など） */
  "conversions",
  /** 課金の売上（税込・円） */
  "grossSales",
  /** 課金の手取り（ストア手数料を引いた額・円） */
  "proceeds",
] as const;

export type AdMetricKey = (typeof AD_METRIC_KEYS)[number];
export type AdMetrics = Record<AdMetricKey, number>;

export interface DayRange {
  /** JST の日付 YYYY-MM-DD（両端を含む） */
  from: string;
  to: string;
}

export interface AdDailyRow {
  date: string;
  /** 媒体の中で行を一意にするキー（キャンペーンID・広告枠ID・商品IDなど） */
  key: string;
  /** 画面に出す名前。省略時は key */
  label?: string;
  metrics: Partial<AdMetrics>;
}

export type Env = Record<string, string | undefined>;

export interface AdSource {
  id: AdSourceId;
  label: string;
  /** 取るものの説明（画面に出す） */
  provides: string;
  /** 取得に必要な環境変数の名前 */
  requiredEnv: readonly string[];
  /**
   * 取るはずだが、まだ取り込んでいない指標。同期に成功していても、この指標は未接続として扱う
   * （0 のまま足して「広告費0円」「CPI 0円」のような誤った値を出さないため）
   */
  pendingMetrics?: readonly AdMetricKey[];
  /** 取得処理。認証情報が届いて実装するまでは無い */
  fetchDaily?: (range: DayRange, env: Env) => Promise<AdDailyRow[]>;
  /**
   * 管理画面からダウンロードした CSV を行にする処理。これがある媒体は画面から CSV を取り込める。
   * 自動の同期（cron・同期ボタン）では、fetchDaily があって認証情報がそろったときだけ取りに行く（autoSyncSources）。
   * 読めない CSV は、画面に出せる理由をつけて AdSourceError で止める
   */
  parseCsv?: (data: Uint8Array) => AdDailyRow[];
}

/** 画面にそのまま出してよい失敗理由。それ以外の例外は理由を伏せてログにだけ残す */
export class AdSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdSourceError";
  }
}
