import { AdSourceError, type DayRange } from "./types";

/**
 * 米ドル→円の為替（欧州中央銀行の参照レート）を日別に取る。
 * https://frankfurter.dev （API キー不要）
 *
 * Tenjin 経由の AdMob の収益は米ドルで返ってくるので、円に直すのに使う（tenjin-admob.ts）。
 * - AdMob 管理画面の円から逆算した比と ±1% 以内で合う（2026-09-10〜09-25 の実測）
 * - 土日・祝日はレートが無いので、その前の営業日のレートを使う
 * - その日以前のレートが無ければ推測せずに失敗する（ドルのまま円として保存しない）
 */

const API_BASE = "https://api.frankfurter.dev/v1/";
const TIMEOUT_MS = 30_000;
/** 期間の初日が連休中でも前の営業日を拾えるよう、さかのぼる日数 */
const LOOKBACK_DAYS = 7;
const DAY_MS = 86_400_000;

type FetchImpl = typeof fetch;

interface RatesBody {
  rates?: Record<string, { JPY?: unknown }>;
}

function daysBefore(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) - days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** 期間の各日（YYYY-MM-DD）の米ドル→円のレートを返す関数を作る */
export async function fetchUsdJpyRates(
  range: DayRange,
  fetchImpl: FetchImpl = fetch,
): Promise<(date: string) => number> {
  const url = new URL(
    `${daysBefore(range.from, LOOKBACK_DAYS)}..${range.to}`,
    API_BASE,
  );
  url.search = new URLSearchParams({ base: "USD", symbols: "JPY" }).toString();

  const res = await fetchImpl(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 500);
    console.error("[fx] 為替レートの取得に失敗しました", {
      status: res.status,
      body,
    });
    throw new AdSourceError(
      `為替レート（米ドル→円）の取得に失敗しました（HTTP ${res.status}）`,
    );
  }

  const body = (await res.json()) as RatesBody;
  const entries = Object.entries(body.rates ?? {});
  if (
    !body.rates ||
    entries.some(([, r]) => typeof r?.JPY !== "number" || !(r.JPY > 0))
  ) {
    throw new AdSourceError("為替レートの応答の形が想定と違います");
  }
  // 新しい日付から順に並べ、その日以前で最も新しいレートを探す
  const sorted = entries
    .map(([date, r]) => [date, r.JPY as number] as const)
    .sort(([a], [b]) => (a < b ? 1 : -1));

  return (date: string) => {
    const hit = sorted.find(([d]) => d <= date);
    if (!hit) {
      throw new AdSourceError(
        `${date} 以前の為替レート（米ドル→円）がありません`,
      );
    }
    return hit[1];
  };
}
