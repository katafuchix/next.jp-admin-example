import { readSmaadDailyCsv, type SmaadDailyCsvLayout } from "./smaad-daily-csv";
import type { AdDailyRow } from "./types";

/**
 * SmaAD の広告主の管理画面「レポート > 日別」（キャンペーン種別: 通常）からダウンロードした CSV を読む。
 * 画面から CSV を取り込む（はぴけんの広告費の出どころ）。API キーがそろえば Report API（smaad-spend.ts）の値で上書きする。
 *
 * CSV は古い日付が上。見出しは「日付,imp,Click,CTR,install,発生CV,発生CVのうち承認,CVR,承認CV,利用金額」。
 * 広告費は利用金額で、承認された成果（承認CV）に付く。成果件数も承認CVを取る。
 * install は SmaAD の計測なので取り込まない（インストール数は Tenjin から取る。混ぜると CPI が狂う）。
 */
const LAYOUT: SmaadDailyCsvLayout = {
  reportName: "SmaAD（広告出稿）の日別レポート",
  dateColumn: "日付",
  metricColumns: [
    ["spend", "利用金額"],
    ["impressions", "imp"],
    ["clicks", "Click"],
    ["conversions", "承認CV"],
  ],
  rowKey: "total",
  rowLabel: "全キャンペーン",
};

export function parseSmaadSpendCsv(data: Uint8Array): AdDailyRow[] {
  return readSmaadDailyCsv(data, LAYOUT);
}
