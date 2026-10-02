import {
  AdSourceError,
  type AdDailyRow,
  type DayRange,
  type Env,
} from "./types";

/**
 * SmaAD Report API for Advertiser から、広告費・表示回数・クリック数・成果件数を日別に取る。
 * 仕様: GMO TECH から共有された「SmaAD Report API for Advertiser」（PDF・2ページ）
 *
 * - API キーとアカウント ID は SmaAD の営業担当から受け取る
 * - 円（currency=JPY）・日本時間（timezone=9）で取る。どちらも指定しないと米ドル・GMT になる
 * - キャンペーンを分けず日付だけで集計し、CSV の取り込み（smaad-spend-csv.ts）と同じキーの行にする。
 *   API がつながれば、CSV で取り込んだ行をそのまま上書きする
 * - レポートの更新は約30分遅れる（メンテナンス中は数時間）
 * - キーは URL に載るので、URL をログに残さない
 */

const ENDPOINT = "https://media.smaad.net/api/reports";
const TIMEOUT_MS = 60_000;

type FetchImpl = typeof fetch;

const SHAPE_ERROR = "SmaAD（広告出稿）のレポートの形が想定と違います";

/** 失敗の応答の本文をログに残す（URL はキーを含むので残さない） */
async function logFailure(res: Response): Promise<void> {
  const body = (await res.text().catch(() => "")).slice(0, 500);
  console.error("[smaad-spend] レポート取得に失敗しました", {
    status: res.status,
    body,
  });
}

function buildUrl(range: DayRange, env: Env): string {
  const params = new URLSearchParams({
    key: env.SMAAD_ADVERTISER_API_KEY ?? "",
    account_id: env.SMAAD_ADVERTISER_ACCOUNT_ID ?? "",
    start_date: range.from,
    end_date: range.to,
    currency: "JPY",
    timezone: "9",
    group_by: "date",
    metrics: "imp,click,cv,cost",
    output_type: "json",
  });
  // 区切りのカンマは仕様書の例どおり、符号化せずに送る
  return `${ENDPOINT}?${params.toString().replaceAll("%2C", ",")}`;
}

/** 数値か数値の文字列だけを読む（仕様書の指標の例は文字列、応答の例は数値） */
function toNumber(v: unknown): number {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim() !== ""
        ? Number(v)
        : NaN;
  if (!Number.isFinite(n)) throw new AdSourceError(SHAPE_ERROR);
  return n;
}

/** 同じ日付の行を足し合わせて、1日1行にする */
function toDailyRows(body: unknown): AdDailyRow[] {
  if (!Array.isArray(body)) throw new AdSourceError(SHAPE_ERROR);
  const byDate = new Map<string, AdDailyRow>();
  for (const r of body as Record<string, unknown>[]) {
    if (typeof r?.date !== "string" || !r.date) {
      throw new AdSourceError(SHAPE_ERROR);
    }
    const prev = byDate.get(r.date)?.metrics;
    byDate.set(r.date, {
      date: r.date,
      key: "total",
      label: "全キャンペーン",
      metrics: {
        spend: (prev?.spend ?? 0) + toNumber(r.cost),
        impressions: (prev?.impressions ?? 0) + toNumber(r.imp),
        clicks: (prev?.clicks ?? 0) + toNumber(r.click),
        conversions: (prev?.conversions ?? 0) + toNumber(r.cv),
      },
    });
  }
  return [...byDate.values()];
}

export async function fetchSmaadSpendDaily(
  range: DayRange,
  env: Env,
  fetchImpl: FetchImpl = fetch,
): Promise<AdDailyRow[]> {
  const res = await fetchImpl(buildUrl(range, env), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    await logFailure(res);
    throw new AdSourceError(
      res.status === 401 || res.status === 403
        ? "SmaAD（広告出稿）に接続できません（API キーかアカウント ID が違います）"
        : `SmaAD（広告出稿）のレポート取得に失敗しました（HTTP ${res.status}）`,
    );
  }
  return toDailyRows(await res.json());
}
