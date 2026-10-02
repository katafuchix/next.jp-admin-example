import {
  AdSourceError,
  type AdDailyRow,
  type AdMetrics,
  type DayRange,
  type Env,
} from "./types";

/**
 * Google AdMob API（v1）からバナー広告の収益を日別・広告枠別に取る。
 * https://developers.google.com/admob/api/reference/rest/v1/accounts.networkReport/generate
 *
 * レポートの日付はアカウントの「レポートの時間帯」で区切られる（API で指定できるのは
 * America/Los_Angeles だけ）。日本時間でないアカウントは日付がずれるので取り込まない。
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://admob.googleapis.com/v1";
const TIMEOUT_MS = 30_000;

type FetchImpl = typeof fetch;

interface MetricValue {
  microsValue?: string;
  integerValue?: string;
  doubleValue?: number;
}

interface ReportRow {
  dimensionValues?: Record<string, { value?: string; displayLabel?: string }>;
  metricValues?: Record<string, MetricValue>;
}

type ReportChunk =
  | { header: unknown }
  | { row: ReportRow }
  | { footer: { matchingRowCount?: string } };

/** 失敗の応答をログに残し、画面に出してよい理由だけを投げる */
async function fail(step: string, res: Response): Promise<never> {
  const body = (await res.text().catch(() => "")).slice(0, 500);
  console.error(`[admob] ${step}に失敗しました`, { status: res.status, body });
  throw new AdSourceError(
    `AdMob の${step}に失敗しました（HTTP ${res.status}）`,
  );
}

async function refreshAccessToken(env: Env, fetchImpl: FetchImpl) {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.ADMOB_CLIENT_ID ?? "",
      client_secret: env.ADMOB_CLIENT_SECRET ?? "",
      refresh_token: env.ADMOB_REFRESH_TOKEN ?? "",
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return fail("認証", res);
  const { access_token } = (await res.json()) as { access_token?: string };
  if (!access_token) {
    throw new AdSourceError("AdMob の認証の応答にトークンがありません");
  }
  return access_token;
}

function toApiDate(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return { year, month, day: date };
}

/** DATE の値（YYYYMMDD）を YYYY-MM-DD にする。形が違えば保存前の検査で落ちる */
function toDayKey(value: string | undefined) {
  const v = value ?? "";
  return /^\d{8}$/.test(v)
    ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}`
    : v;
}

function toMetrics(values: Record<string, MetricValue>): Partial<AdMetrics> {
  const metrics: Partial<AdMetrics> = {};
  const earnings = values.ESTIMATED_EARNINGS?.microsValue;
  if (earnings !== undefined) metrics.revenue = Number(earnings) / 1_000_000;
  const impressions = values.IMPRESSIONS?.integerValue;
  if (impressions !== undefined) metrics.impressions = Number(impressions);
  const clicks = values.CLICKS?.integerValue;
  if (clicks !== undefined) metrics.clicks = Number(clicks);
  return metrics;
}

export async function fetchAdmobDaily(
  range: DayRange,
  env: Env,
  fetchImpl: FetchImpl = fetch,
): Promise<AdDailyRow[]> {
  const token = await refreshAccessToken(env, fetchImpl);
  const accountUrl = `${API_BASE}/accounts/${env.ADMOB_PUBLISHER_ID}`;
  const headers = { Authorization: `Bearer ${token}` };

  const accountRes = await fetchImpl(accountUrl, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!accountRes.ok) return fail("アカウント情報の取得", accountRes);
  const { reportingTimeZone } = (await accountRes.json()) as {
    reportingTimeZone?: string;
  };
  if (reportingTimeZone !== "Asia/Tokyo") {
    throw new AdSourceError(
      `AdMob のレポートの時間帯が日本時間ではありません（${reportingTimeZone ?? "不明"}）。日付がずれるため取り込みません`,
    );
  }

  const reportRes = await fetchImpl(`${accountUrl}/networkReport:generate`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      reportSpec: {
        dateRange: {
          startDate: toApiDate(range.from),
          endDate: toApiDate(range.to),
        },
        dimensions: ["DATE", "AD_UNIT"],
        metrics: ["ESTIMATED_EARNINGS", "IMPRESSIONS", "CLICKS"],
        localizationSettings: { currencyCode: "JPY" },
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!reportRes.ok) return fail("レポート取得", reportRes);
  const chunks = (await reportRes.json()) as ReportChunk[];
  if (!Array.isArray(chunks)) {
    throw new AdSourceError("AdMob のレポートの形が想定と違います");
  }

  const rows = chunks.flatMap((c): AdDailyRow[] => {
    if (!("row" in c)) return [];
    const dims = c.row.dimensionValues ?? {};
    return [
      {
        date: toDayKey(dims.DATE?.value),
        key: dims.AD_UNIT?.value ?? "",
        label: dims.AD_UNIT?.displayLabel,
        metrics: toMetrics(c.row.metricValues ?? {}),
      },
    ];
  });

  const footer = chunks.find((c) => "footer" in c);
  const matching = Number(
    footer && "footer" in footer ? footer.footer.matchingRowCount : NaN,
  );
  if (Number.isFinite(matching) && matching > rows.length) {
    throw new AdSourceError(
      `AdMob のレポートが行数の上限で打ち切られました（${matching}件中${rows.length}件）`,
    );
  }
  return rows;
}
