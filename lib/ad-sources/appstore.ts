import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { listDayKeys } from "@/lib/jst-date";
import {
  AdSourceError,
  type AdDailyRow,
  type DayRange,
  type Env,
} from "./types";

/**
 * App Store Connect API の売上レポート（Sales and Trends の日次サマリー）から、
 * iOS の課金売上を商品（SKU）別・日別に取る。
 * https://developer.apple.com/documentation/appstoreconnectapi/get-v1-salesreports
 * https://developer.apple.com/help/app-store-connect/reference/reporting/summary-sales-report
 *
 * - 日次レポートの1日は米国太平洋時間で区切られる（日本時間とは16〜17時間ずれる）。
 *   API では変えられないので、その日付のまま保存する。月の合計はほぼ一致する
 * - 売上が1件も無い日と、まだ出ていない日（翌日の朝8時 PT 頃に出る）は 404 が返る
 * - レポートの版は Apple が何度か上げているので指定せず（最新が返る）、列名で読む
 */

const API_URL = "https://api.appstoreconnect.apple.com/v1/salesReports";
const TIMEOUT_MS = 30_000;
/** Apple は20分より先の期限を受け付けない。1リクエストごとに作り直すので短くてよい */
const TOKEN_TTL_SEC = 5 * 60;

const COLUMNS = [
  "SKU",
  "Title",
  "Units",
  "Developer Proceeds",
  "Customer Price",
  "Customer Currency",
  "Currency of Proceeds",
  "Begin Date",
] as const;
type Column = (typeof COLUMNS)[number];

type FetchImpl = typeof fetch;

function loadPrivateKey(env: Env): KeyObject {
  // 環境変数へ1行で入れると改行が「\n」の2文字になるので戻す
  const pem = (env.APPSTORE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType === "ec") return key;
  } catch {
    // 下で同じ理由を投げる
  }
  throw new AdSourceError(
    "App Store Connect の秘密鍵（.p8）を読み込めません。ファイルの中身をそのまま設定してください",
  );
}

function createToken(env: Env, key: KeyObject, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000);
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "ES256", kid: env.APPSTORE_KEY_ID, typ: "JWT" })}.${encode(
    {
      iss: env.APPSTORE_ISSUER_ID,
      iat,
      exp: iat + TOKEN_TTL_SEC,
      aud: "appstoreconnect-v1",
    },
  )}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${unsigned}.${signature.toString("base64url")}`;
}

/** 失敗の応答をログに残し、画面に出してよい理由だけを投げる */
async function fail(step: string, res: Response): Promise<never> {
  const body = (await res.text().catch(() => "")).slice(0, 500);
  console.error(`[appstore] ${step}に失敗しました`, {
    status: res.status,
    body,
  });
  throw new AdSourceError(
    `App Store Connect の${step}に失敗しました（HTTP ${res.status}）`,
  );
}

/** レポートの日付（MM/DD/YYYY）を YYYY-MM-DD にする */
function toDayKey(value: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : value;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseReport(tsv: string, day: string): AdDailyRow[] {
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];

  const header = lines[0].split("\t").map((h) => h.trim());
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new AdSourceError(
      `App Store Connect のレポートの形が想定と違います（${missing.join("・")} の列がありません）`,
    );
  }
  const at = Object.fromEntries(
    COLUMNS.map((c) => [c, header.indexOf(c)]),
  ) as Record<Column, number>;

  const bySku = new Map<string, AdDailyRow>();
  const foreign = new Set<string>();
  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    const cell = (c: Column) => (cells[at[c]] ?? "").trim();

    const begin = cell("Begin Date");
    if (toDayKey(begin) !== day) {
      throw new AdSourceError(
        `App Store Connect のレポートの日付が頼んだ日と違います（${day} を頼んで ${begin}）`,
      );
    }
    const units = Number(cell("Units"));
    const price = Number(cell("Customer Price"));
    const proceedsPerUnit = Number(cell("Developer Proceeds"));
    // 無料のダウンロード・アップデートは売上に関係しない
    if (price === 0 && proceedsPerUnit === 0) continue;

    for (const c of ["Customer Currency", "Currency of Proceeds"] as const) {
      if (cell(c) !== "JPY") foreign.add(cell(c) || "不明");
    }

    // 返金は「数量が負・顧客価格も負・手取り単価は正」で届く。符号は数量だけで決める
    const sku = cell("SKU");
    const row = bySku.get(sku) ?? {
      date: day,
      key: sku,
      label: cell("Title") || undefined,
      metrics: { grossSales: 0, proceeds: 0 },
    };
    bySku.set(sku, {
      ...row,
      metrics: {
        grossSales: (row.metrics.grossSales ?? 0) + units * Math.abs(price),
        proceeds:
          (row.metrics.proceeds ?? 0) + units * Math.abs(proceedsPerUnit),
      },
    });
  }

  if (foreign.size > 0) {
    throw new AdSourceError(
      `App Store Connect の ${day} の売上に日本円以外（${[...foreign].join("・")}）が含まれています。円への換算方法が決まるまで取り込みません`,
    );
  }
  return [...bySku.values()].map((row) => ({
    ...row,
    metrics: {
      grossSales: round2(row.metrics.grossSales ?? 0),
      proceeds: round2(row.metrics.proceeds ?? 0),
    },
  }));
}

/** gzip で届く（fetch は展開しない）。念のため展開済みの本文も受ける */
function decodeBody(bytes: Buffer): string {
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  try {
    return (gzipped ? gunzipSync(bytes) : bytes).toString("utf8");
  } catch {
    throw new AdSourceError("App Store Connect の売上レポートを展開できません");
  }
}

async function fetchDay(
  day: string,
  env: Env,
  key: KeyObject,
  fetchImpl: FetchImpl,
  nowMs: number,
): Promise<AdDailyRow[]> {
  const query = new URLSearchParams({
    "filter[frequency]": "DAILY",
    "filter[reportType]": "SALES",
    "filter[reportSubType]": "SUMMARY",
    "filter[vendorNumber]": env.APPSTORE_VENDOR_NUMBER ?? "",
    "filter[reportDate]": day,
  });
  const res = await fetchImpl(`${API_URL}?${query}`, {
    headers: {
      Authorization: `Bearer ${createToken(env, key, nowMs)}`,
      Accept: "application/a-gzip",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 404) {
    // 売上の無い日・まだ出ていない日。理由は本文にしか無いのでログに残す
    const body = (await res.text().catch(() => "")).slice(0, 300);
    console.warn(`[appstore] ${day} のレポートはありません`, { body });
    return [];
  }
  if (!res.ok) return fail(`${day} の売上レポート取得`, res);
  return parseReport(decodeBody(Buffer.from(await res.arrayBuffer())), day);
}

export async function fetchAppStoreDaily(
  range: DayRange,
  env: Env,
  fetchImpl: FetchImpl = fetch,
  now: () => number = Date.now,
): Promise<AdDailyRow[]> {
  const key = loadPrivateKey(env);
  const rows: AdDailyRow[] = [];
  for (const day of listDayKeys(range.from, range.to)) {
    rows.push(...(await fetchDay(day, env, key, fetchImpl, now())));
  }
  return rows;
}
