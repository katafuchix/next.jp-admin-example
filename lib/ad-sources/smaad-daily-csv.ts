import { AdSourceError, type AdDailyRow, type AdMetricKey } from "./types";

/**
 * SmaAD の管理画面（媒体・広告主のどちらも）の日別レポートからダウンロードした CSV を読む。
 *
 * CSV は Shift_JIS・改行 CRLF・合計行なし・桁区切りなし・日付は「YYYY/MM/DD」。
 * 媒体と広告主では日付の列の名前と取り込む列が違うので、それをレイアウトとして受け取る。
 * 日付の列の名前が違うので、もう一方の CSV を取り込もうとすると理由をつけて止まる。
 */
export type SmaadDailyCsvLayout = {
  /** エラーメッセージに出すレポートの名前（例:「SmaAD の日別レポート」） */
  readonly reportName: string;
  readonly dateColumn: string;
  readonly metricColumns: readonly (readonly [AdMetricKey, string])[];
  /** 内訳を分けないレポートなので、1日1行 */
  readonly rowKey: string;
  readonly rowLabel: string;
};

/** 管理画面の CSV は Shift_JIS。Excel などで UTF-8 に保存し直したものも読めるようにする */
function decode(data: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return new TextDecoder("shift_jis").decode(data);
  }
}

function columnIndexes(header: string, layout: SmaadDailyCsvLayout) {
  const names = header.split(",").map((name) => name.trim());
  const dateAt = names.indexOf(layout.dateColumn);
  if (dateAt < 0) {
    throw new AdSourceError(
      `${layout.reportName}の CSV ではありません（「${layout.dateColumn}」の列がありません）`,
    );
  }
  const metrics = layout.metricColumns.map(([metric, name]) => {
    const at = names.indexOf(name);
    if (at < 0) throw new AdSourceError(`「${name}」の列が見つかりません`);
    return { metric, name, at };
  });
  return { width: names.length, dateAt, metrics };
}

function readRow(
  line: string,
  lineNo: number,
  columns: ReturnType<typeof columnIndexes>,
  layout: SmaadDailyCsvLayout,
): AdDailyRow {
  const cells = line.split(",").map((cell) => cell.trim());
  if (cells.length !== columns.width) {
    throw new AdSourceError(`${lineNo}行目の列の数が見出しと合いません`);
  }
  const date = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(cells[columns.dateAt]);
  if (!date) {
    throw new AdSourceError(
      `${lineNo}行目の日付が読めません（${cells[columns.dateAt]}）`,
    );
  }
  const metrics: AdDailyRow["metrics"] = {};
  for (const { metric, name, at } of columns.metrics) {
    const value = cells[at];
    if (!/^\d+(\.\d+)?$/.test(value)) {
      throw new AdSourceError(
        `${lineNo}行目の${name}が数値ではありません（${value || "空欄"}）`,
      );
    }
    metrics[metric] = Number(value);
  }
  return {
    date: `${date[1]}-${date[2]}-${date[3]}`,
    key: layout.rowKey,
    label: layout.rowLabel,
    metrics,
  };
}

export function readSmaadDailyCsv(
  data: Uint8Array,
  layout: SmaadDailyCsvLayout,
): AdDailyRow[] {
  const [header = "", ...lines] = decode(data).split(/\r?\n/);
  const columns = columnIndexes(header, layout);
  return lines.flatMap((line, i) =>
    line.trim() ? [readRow(line, i + 2, columns, layout)] : [],
  );
}
