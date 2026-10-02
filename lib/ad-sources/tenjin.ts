import {
  AdSourceError,
  type AdDailyRow,
  type DayRange,
  type Env,
} from "./types";

/**
 * Tenjin Reporting Metrics API（v2）から、広告経由のインストール数を日別・媒体×アプリ別に取る。
 * https://api.tenjin.com/v2/reports/spend
 *
 * - 日付は UTC で区切られる（Tenjin の仕様）。日別の合計しか取れないので日本時間には組み直せない
 * - Organic（ad_network_id 0）は広告経由ではないので除く
 * - 広告費（spend）は取り込まない（広告費は SmaAD の広告出稿から取る。Tenjin 側は Circuit X などがドル建てで混ざる）
 * - 次のページは応答の links.next が http なので使わず、https のまま page を進める
 * - ページのたどり方（fetchTenjinReport）は AdMob の広告収益レポート（tenjin-admob.ts）と共通
 */

const API_BASE = "https://api.tenjin.com/v2/reports/";
const PER_PAGE = 1000;
const MAX_PAGES = 50;
const TIMEOUT_MS = 60_000;
const ORGANIC_NETWORK_ID = 0;

type FetchImpl = typeof fetch;

/** group_by=channel,app のレポートの1行に共通の項目 */
export interface TenjinChannelAppRow {
  date?: string;
  ad_network_id?: number;
  ad_network_name?: string;
  app_id?: string;
  platform?: string;
}

interface SpendAttributes extends TenjinChannelAppRow {
  spend?: number | null;
  tracked_installs?: number | null;
}

/** レポートの種類（URL の末尾）と、期間・ページ以外の条件 */
export interface TenjinReport {
  name: "spend" | "ad_revenue";
  params: Record<string, string>;
}

const SPEND_REPORT: TenjinReport = {
  name: "spend",
  params: {
    granularity: "daily",
    group_by: "channel,app",
    metrics: "spend,tracked_installs",
  },
};

interface ReportPage<T> {
  data?: { attributes?: T }[];
  meta?: { count?: number };
}

const PLATFORM_LABELS: Record<string, string> = {
  ios: "iOS",
  android: "Android",
};

/** 失敗の応答をログに残し、画面に出してよい理由だけを投げる */
async function fail(res: Response): Promise<never> {
  const body = (await res.text().catch(() => "")).slice(0, 500);
  console.error("[tenjin] レポート取得に失敗しました", {
    status: res.status,
    body,
  });
  throw new AdSourceError(
    `Tenjin のレポート取得に失敗しました（HTTP ${res.status}）`,
  );
}

async function fetchPage<T>(
  report: TenjinReport,
  range: DayRange,
  pageNo: number,
  env: Env,
  fetchImpl: FetchImpl,
) {
  const url = new URL(report.name, API_BASE);
  url.search = new URLSearchParams({
    start_date: range.from,
    end_date: range.to,
    ...report.params,
    per_page: String(PER_PAGE),
    page: String(pageNo),
  }).toString();

  const res = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${env.TENJIN_API_KEY}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return fail(res);
  const body = (await res.json()) as ReportPage<T>;
  if (!Array.isArray(body.data) || typeof body.meta?.count !== "number") {
    throw new AdSourceError("Tenjin のレポートの形が想定と違います");
  }
  return {
    data: body.data.map((d) => d.attributes ?? ({} as T)),
    count: body.meta.count,
  };
}

/** 全ページをたどる。件数に届かなければ欠けたまま返さない */
export async function fetchTenjinReport<T extends object>(
  report: TenjinReport,
  range: DayRange,
  env: Env,
  fetchImpl: FetchImpl,
): Promise<T[]> {
  let rows: T[] = [];
  for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
    const { data, count } = await fetchPage<T>(
      report,
      range,
      pageNo,
      env,
      fetchImpl,
    );
    rows = [...rows, ...data];
    if (rows.length >= count) return rows;
    if (data.length === 0) {
      throw new AdSourceError(
        `Tenjin のレポートが途中で途切れました（${count}件中${rows.length}件）`,
      );
    }
  }
  throw new AdSourceError(
    `Tenjin のレポートが多すぎます（${MAX_PAGES * PER_PAGE}件を超えました）。期間を短くしてください`,
  );
}

/** 媒体×アプリ×日の行にする。キーは「媒体ID:アプリID」、名前は「媒体名（iOS / Android）」 */
export function toChannelAppRow(
  a: TenjinChannelAppRow,
  metrics: AdDailyRow["metrics"],
): AdDailyRow {
  const platform = a.platform ?? "";
  const name = a.ad_network_name ?? String(a.ad_network_id);
  return {
    date: a.date ?? "",
    key: `${a.ad_network_id}:${a.app_id ?? ""}`,
    label: `${name}（${PLATFORM_LABELS[platform] ?? platform}）`,
    metrics,
  };
}

export async function fetchTenjinDaily(
  range: DayRange,
  env: Env,
  fetchImpl: FetchImpl = fetch,
): Promise<AdDailyRow[]> {
  const rows = await fetchTenjinReport<SpendAttributes>(
    SPEND_REPORT,
    range,
    env,
    fetchImpl,
  );

  return rows
    .filter((a) => a.ad_network_id !== ORGANIC_NETWORK_ID)
    .map((a) =>
      toChannelAppRow(
        a,
        typeof a.tracked_installs === "number"
          ? { installs: a.tracked_installs }
          : {},
      ),
    );
}
