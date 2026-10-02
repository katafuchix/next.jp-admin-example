import { readSmaadDailyCsv, type SmaadDailyCsvLayout } from "./smaad-daily-csv";
import type { AdDailyRow } from "./types";

/**
 * SmaAD の媒体管理画面「レポート > 日別」からダウンロードした CSV を読む。
 * SmaAD の媒体向けの API は見つかっていないので、画面から CSV を取り込む。
 *
 * CSV は新しい日付が上。見出しは「日別,imp,Click,CTR,install,発生CV,CVR,承認数,非承認数,発生金額」。
 * 収益は発生金額（承認前を含む）で、日付は画面で選んだ区切り（発生日・日本時間）に従う。
 * install はオファーウォールで紹介した他社アプリのインストール数なので取り込まない。
 */
const LAYOUT: SmaadDailyCsvLayout = {
  reportName: "SmaAD の日別レポート",
  dateColumn: "日別",
  metricColumns: [
    ["revenue", "発生金額"],
    ["impressions", "imp"],
    ["clicks", "Click"],
    ["conversions", "発生CV"],
  ],
  rowKey: "total",
  rowLabel: "全広告枠",
};

export function parseSmaadCsv(data: Uint8Array): AdDailyRow[] {
  return readSmaadDailyCsv(data, LAYOUT);
}
