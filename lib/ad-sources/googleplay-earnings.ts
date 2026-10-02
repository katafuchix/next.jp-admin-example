import { readCsvRows } from "./csv";
import { AdSourceError } from "./types";

/**
 * Google Play Console の収益レポート（earnings/earnings_YYYYMM_….zip）を注文ごとの手取りにする。
 * https://support.google.com/googleplay/android-developer/answer/6135870
 *
 * - 月1回、翌月の上旬に出る。1件の注文が「課金」「Google の手数料」「税」などの複数行に分かれて届く
 * - 1行の「Amount (Merchant Currency)」は受取通貨での増減（手数料・税はマイナス）。
 *   注文（Description）ごとに合計したものが、その注文の手取りになる（返金もマイナスの行で届く）
 * - 購入者の州・郵便番号の列もあるが、読まない（ログにも出さない）
 */

const COLUMNS = [
  "Description",
  "Merchant Currency",
  "Amount (Merchant Currency)",
] as const;
type Column = (typeof COLUMNS)[number];

export interface OrderEarnings {
  /** 受取通貨。注文の中で食い違えば "混在" */
  currency: string;
  amount: number;
}

function add(a: OrderEarnings | undefined, b: OrderEarnings): OrderEarnings {
  return {
    currency: a === undefined || a.currency === b.currency ? b.currency : "混在",
    amount: (a?.amount ?? 0) + b.amount,
  };
}

/** 注文ごとの手取りを足し合わせた新しい Map を返す（同じ注文が複数のファイルに分かれて載ることがある） */
export function mergeEarnings(
  ...maps: ReadonlyMap<string, OrderEarnings>[]
): Map<string, OrderEarnings> {
  const merged = new Map<string, OrderEarnings>();
  for (const m of maps) {
    for (const [order, e] of m) merged.set(order, add(merged.get(order), e));
  }
  return merged;
}

export function parseEarnings(
  text: string,
  file: string,
): Map<string, OrderEarnings> {
  const rows = (() => {
    try {
      return readCsvRows(text);
    } catch {
      throw new AdSourceError(
        `Google Play の収益レポート（${file}）が途中で切れています`,
      );
    }
  })();
  if (rows.length === 0) return new Map();

  const header = rows[0].map((h) => h.trim());
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new AdSourceError(
      `Google Play の収益レポートの形が想定と違います（${missing.join("・")} の列がありません）`,
    );
  }
  const at = Object.fromEntries(
    COLUMNS.map((c) => [c, header.indexOf(c)]),
  ) as Record<Column, number>;

  return rows.slice(1).reduce((acc, cells) => {
    const cell = (c: Column) => (cells[at[c]] ?? "").trim();
    const order = cell("Description");
    if (order === "") {
      throw new AdSourceError(
        `Google Play の収益レポート（${file}）に、注文番号（Description）が空の行があります`,
      );
    }
    const amountText = cell("Amount (Merchant Currency)").replace(/,/g, "");
    const amount = Number(amountText);
    if (amountText === "" || !Number.isFinite(amount)) {
      throw new AdSourceError(
        `Google Play の収益レポート（${file}）に、金額（Amount (Merchant Currency)）が読めない行があります`,
      );
    }
    const currency = cell("Merchant Currency") || "不明";
    return acc.set(order, add(acc.get(order), { currency, amount }));
  }, new Map<string, OrderEarnings>());
}
