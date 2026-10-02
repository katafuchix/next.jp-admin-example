import {
  fetchTenjinReport,
  toChannelAppRow,
  type TenjinChannelAppRow,
  type TenjinReport,
} from "./tenjin";
import { fetchUsdJpyRates } from "./fx";
import type { AdDailyRow, DayRange, Env } from "./types";

/**
 * Tenjin の広告収益レポート（v2）から、AdMob の収益・表示回数・クリック数を日別・アプリ別に取る。
 * https://api.tenjin.com/v2/reports/ad_revenue
 *
 * AdMob を直接つなぐ（admob.ts）にはクライアントの Google アカウントの二段階認証が要るので、
 * それまでは Tenjin の API キーだけで取れるこちらを使う。
 *
 * - 日付は UTC で区切られる（Tenjin の仕様。日本時間の朝9時が境目）
 * - AdMob（ad_network_id 4）の行だけを取り込む。ほかの媒体を AdMob として数えない
 * - 収益（ad_revenue）は米ドル。その日の為替（fx.ts）で円に換算して保存する
 *   （2026-09-17 の Android 9.21 は AdMob 管理画面で 1,433円。以前は円と読み違えていた）
 */

const ADMOB_NETWORK_ID = 4;

const AD_REVENUE_REPORT: TenjinReport = {
  name: "ad_revenue",
  params: { granularity: "daily", group_by: "channel,app" },
};

interface AdRevenueAttributes extends TenjinChannelAppRow {
  ad_revenue?: number | null;
  impressions?: number | null;
  clicks?: number | null;
}

type FetchImpl = typeof fetch;

export async function fetchTenjinAdmobDaily(
  range: DayRange,
  env: Env,
  fetchImpl: FetchImpl = fetch,
): Promise<AdDailyRow[]> {
  const rows = await fetchTenjinReport<AdRevenueAttributes>(
    AD_REVENUE_REPORT,
    range,
    env,
    fetchImpl,
  );

  const admobRows = rows.filter((a) => a.ad_network_id === ADMOB_NETWORK_ID);
  // 収益が1件も無ければ為替は要らない（外部への問い合わせを増やさない）
  const rateOn = admobRows.some((a) => typeof a.ad_revenue === "number")
    ? await fetchUsdJpyRates(range, fetchImpl)
    : null;

  return admobRows.map((a) =>
    toChannelAppRow(a, {
      ...(typeof a.ad_revenue === "number" && rateOn
        ? { revenue: toYen(a.ad_revenue, rateOn(a.date ?? "")) }
        : {}),
      ...(typeof a.impressions === "number"
        ? { impressions: a.impressions }
        : {}),
      ...(typeof a.clicks === "number" ? { clicks: a.clicks } : {}),
    }),
  );
}

/** 米ドルを円にする。浮動小数の誤差を残さないよう1銭で丸める */
function toYen(usd: number, rate: number): number {
  return Math.round(usd * rate * 100) / 100;
}
