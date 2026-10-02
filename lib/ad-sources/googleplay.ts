import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { addDays, jstDayKey } from "@/lib/jst-date";
import { readCsvRows } from "./csv";
import {
  mergeEarnings,
  parseEarnings,
  type OrderEarnings,
} from "./googleplay-earnings";
import {
  AdSourceError,
  type AdDailyRow,
  type DayRange,
  type Env,
} from "./types";
import { unzip } from "./zip";

/**
 * Google Play Console の売上レポート（Cloud Storage の sales/salesreport_YYYYMM.zip）から、
 * Android の課金売上（税込）を商品（SKU）別・日別に取る。
 * https://support.google.com/googleplay/android-developer/answer/6135870
 *
 * - レポートは月ごとに1ファイルで、その月の注文が毎日追記される
 * - 1行が1件の注文。日付は注文時刻（Unix 秒）を日本時間に直して区切る。
 *   ファイルの月は日本時間で区切られていないので、期間の前日の月から読む
 * - 手取り（手数料を引いた額）はこのレポートに無いので、月1回出る収益レポート（earnings）から注文番号で引き当てる。
 *   収益レポートは翌月の上旬に出るので、それまでの注文は手取りを入れない（行に proceeds を持たせない）
 * - 購入者の市区町村・郵便番号の列もあるが、読まない（ログにも出さない）
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STORAGE_URL = "https://storage.googleapis.com/storage/v1/b";
/** レポートを読むだけ。書き込みの権限は頼まない */
const SCOPE = "https://www.googleapis.com/auth/devstorage.read_only";
const TIMEOUT_MS = 30_000;
/** Google は1時間より先の期限を受け付けない */
const TOKEN_TTL_SEC = 60 * 60;
const BUCKET_PATTERN = /^[a-z0-9._-]+$/;
/** 秒の Unix 時刻（2001〜2286年）。ミリ秒で届いたら黙って別の日にせず失敗させる */
const TIMESTAMP_PATTERN = /^\d{9,10}$/;

const COLUMNS = [
  "Order Number",
  "Order Charged Timestamp",
  "Financial Status",
  "Product Title",
  "SKU ID",
  "Currency of Sale",
  "Charged Amount",
] as const;
type Column = (typeof COLUMNS)[number];

type FetchImpl = typeof fetch;

interface Credentials {
  email: string;
  keyId?: string;
  key: KeyObject;
}

interface Sale {
  order: string;
  date: string;
  sku: string;
  title: string;
  status: string;
  currency: string;
  amount: number;
}

/** ダウンロードした JSON をそのまま入れても、base64 にして1行で入れても読む */
function parseJson(raw: string): unknown {
  const text = raw.trim();
  try {
    return JSON.parse(
      text.startsWith("{")
        ? text
        : Buffer.from(text, "base64").toString("utf8"),
    );
  } catch {
    return null;
  }
}

function loadCredentials(env: Env): Credentials {
  const account = parseJson(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ?? "");
  if (account === null || typeof account !== "object") {
    throw new AdSourceError(
      "Google Play のサービスアカウントの鍵（JSON）を読み込めません。ダウンロードした JSON の中身をそのまま設定してください",
    );
  }
  const {
    client_email: email,
    private_key: pem,
    private_key_id: keyId,
  } = account as Record<string, unknown>;
  if (typeof email !== "string" || email === "") {
    throw new AdSourceError(
      "Google Play のサービスアカウントの鍵（JSON）に client_email がありません",
    );
  }
  try {
    // 環境変数へ1行で入れると改行が「\n」の2文字になるので戻す
    const key = createPrivateKey(String(pem ?? "").replace(/\\n/g, "\n"));
    if (key.asymmetricKeyType === "rsa") {
      return {
        email,
        keyId: typeof keyId === "string" && keyId !== "" ? keyId : undefined,
        key,
      };
    }
  } catch {
    // 下で同じ理由を投げる
  }
  throw new AdSourceError(
    "Google Play のサービスアカウントの鍵（JSON）の private_key を読み込めません",
  );
}

function loadBucket(env: Env): string {
  const bucket = (env.GOOGLE_PLAY_REPORTS_BUCKET ?? "")
    .trim()
    .replace(/^gs:\/\//, "")
    .replace(/\/+$/, "");
  if (BUCKET_PATTERN.test(bucket)) return bucket;
  throw new AdSourceError(
    "Google Play のレポートの置き場所（GOOGLE_PLAY_REPORTS_BUCKET）が読めません。Play Console の「レポートのダウンロード」にある gs://pubsite_prod_… を設定してください",
  );
}

function createAssertion(creds: Credentials, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000);
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = creds.keyId
    ? { alg: "RS256", typ: "JWT", kid: creds.keyId }
    : { alg: "RS256", typ: "JWT" };
  const unsigned = `${encode(header)}.${encode({
    iss: creds.email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat,
    exp: iat + TOKEN_TTL_SEC,
  })}`;
  const signature = sign("sha256", Buffer.from(unsigned), creds.key);
  return `${unsigned}.${signature.toString("base64url")}`;
}

/** 失敗の応答をログに残し、画面に出してよい理由だけを投げる */
async function fail(step: string, res: Response): Promise<never> {
  const body = (await res.text().catch(() => "")).slice(0, 500);
  console.error(`[googleplay] ${step}に失敗しました`, {
    status: res.status,
    body,
  });
  throw new AdSourceError(
    `Google Play の${step}に失敗しました（HTTP ${res.status}）`,
  );
}

async function fetchAccessToken(
  creds: Credentials,
  fetchImpl: FetchImpl,
  nowMs: number,
): Promise<string> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: createAssertion(creds, nowMs),
    }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return fail("認証", res);
  const body = (await res.json().catch(() => null)) as {
    access_token?: unknown;
  } | null;
  if (typeof body?.access_token !== "string" || body.access_token === "") {
    throw new AdSourceError(
      "Google Play の認証の応答にアクセストークンがありません",
    );
  }
  return body.access_token;
}

/** 期間の前日（日本時間の1日0〜9時は UTC では前月）から最後の日までの月を YYYYMM で並べる */
function listMonths(range: DayRange): string[] {
  const index = (key: string) =>
    Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
  const first = index(addDays(range.from, -1));
  const count = index(range.to) - first + 1;
  return Array.from({ length: Math.max(count, 0) }, (_, i) => {
    const n = first + i;
    return `${Math.floor(n / 12)}${String((n % 12) + 1).padStart(2, "0")}`;
  });
}

/** YYYYMM の翌月 */
function nextMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(4, 6));
  return m === 12 ? `${y + 1}01` : `${y}${String(m + 1).padStart(2, "0")}`;
}

/** UTF-8 で届く。念のため BOM 付きと UTF-16（Play Console の他のレポートの形）も受ける */
function decodeText(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2).toString("utf16le");
  }
  const text = bytes.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function extractCsv(zip: Buffer, what: string): string {
  const files = (() => {
    try {
      return unzip(zip);
    } catch (e) {
      console.error(`[googleplay] ${what}を展開できません`, {
        reason: e instanceof Error ? e.message : String(e),
      });
      throw new AdSourceError(`Google Play の${what}を展開できません`);
    }
  })();
  const csv = [...files].find(([name]) => name.toLowerCase().endsWith(".csv"));
  if (!csv) {
    throw new AdSourceError(`Google Play の${what}に CSV が入っていません`);
  }
  return decodeText(csv[1]);
}

interface Storage {
  bucket: string;
  token: string;
  fetchImpl: FetchImpl;
}

async function storageGet(storage: Storage, path: string): Promise<Response> {
  return storage.fetchImpl(`${STORAGE_URL}/${storage.bucket}/o${path}`, {
    headers: { Authorization: `Bearer ${storage.token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** 403 は権限の反映待ち、バケット違いの 404 は設定の誤り。どちらも画面に出せる理由にして投げる */
async function failAccess(res: Response, bucket: string): Promise<never> {
  const body = (await res.text().catch(() => "")).slice(0, 500);
  return failAccessWith(res.status, body, bucket);
}

function failAccessWith(status: number, body: string, bucket: string): never {
  if (status === 403) {
    console.error("[googleplay] レポートを読む権限がありません", {
      status,
      body,
    });
    throw new AdSourceError(
      "Google Play のレポートを読む権限がまだありません（HTTP 403）。Play Console でサービスアカウントに「財務データの閲覧」を付けてから、反映まで最大48時間かかることがあります",
    );
  }
  console.error("[googleplay] レポートの置き場所が見つかりません", {
    status,
    body,
  });
  throw new AdSourceError(
    `Google Play のレポートの置き場所（バケット ${bucket}）が見つかりません（HTTP 404）。GOOGLE_PLAY_REPORTS_BUCKET を確かめてください`,
  );
}

async function fetchMonth(
  month: string,
  storage: Storage,
): Promise<string | null> {
  const { bucket } = storage;
  const object = encodeURIComponent(`sales/salesreport_${month}.zip`);
  const res = await storageGet(storage, `/${object}?alt=media`);
  if (res.status === 404) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    // まだ出ていない月。バケットの名前違いも 404 なので、本文で見分ける
    if (body.includes("No such object")) {
      console.warn(`[googleplay] ${month} の売上レポートはまだありません`, {
        body,
      });
      return null;
    }
    return failAccessWith(res.status, body, bucket);
  }
  if (res.status === 403) return failAccess(res, bucket);
  if (!res.ok) return fail(`${month} の売上レポート取得`, res);
  return extractCsv(
    Buffer.from(await res.arrayBuffer()),
    ` ${month} の売上レポート`,
  );
}

/**
 * その月の収益レポートを読み、注文ごとの手取りにする。まだ出ていない月は空。
 * ファイル名の末尾（開発者 ID・連番）は決め打ちせず、月の接頭辞で一覧から探す
 */
async function fetchEarnings(
  month: string,
  storage: Storage,
): Promise<Map<string, OrderEarnings>> {
  const prefix = encodeURIComponent(`earnings/earnings_${month}`);
  const listed = await storageGet(storage, `?prefix=${prefix}`);
  if (listed.status === 403 || listed.status === 404) {
    return failAccess(listed, storage.bucket);
  }
  if (!listed.ok) return fail(`${month} の収益レポートの一覧取得`, listed);
  const body = (await listed.json().catch(() => null)) as {
    items?: { name?: unknown }[];
  } | null;
  const names = (body?.items ?? [])
    .map((item) => item.name)
    .filter(
      (name): name is string =>
        typeof name === "string" && name.toLowerCase().endsWith(".zip"),
    )
    .sort();

  const files: Map<string, OrderEarnings>[] = [];
  for (const name of names) {
    const file = name.slice(name.lastIndexOf("/") + 1);
    const res = await storageGet(
      storage,
      `/${encodeURIComponent(name)}?alt=media`,
    );
    if (res.status === 403) return failAccess(res, storage.bucket);
    if (!res.ok) return fail(`収益レポート（${file}）の取得`, res);
    const text = extractCsv(
      Buffer.from(await res.arrayBuffer()),
      `収益レポート（${file}）`,
    );
    files.push(parseEarnings(text, file));
  }
  return mergeEarnings(...files);
}

function parseReport(text: string, month: string): Sale[] {
  const rows = (() => {
    try {
      return readCsvRows(text);
    } catch {
      throw new AdSourceError(
        `Google Play の ${month} の売上レポートが途中で切れています`,
      );
    }
  })();
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new AdSourceError(
      `Google Play の売上レポートの形が想定と違います（${missing.join("・")} の列がありません）`,
    );
  }
  const at = Object.fromEntries(
    COLUMNS.map((c) => [c, header.indexOf(c)]),
  ) as Record<Column, number>;

  return rows.slice(1).map((cells) => {
    const cell = (c: Column) => (cells[at[c]] ?? "").trim();
    const timestamp = cell("Order Charged Timestamp");
    if (!TIMESTAMP_PATTERN.test(timestamp)) {
      throw new AdSourceError(
        `Google Play の ${month} の売上レポートに、注文時刻（Order Charged Timestamp）が読めない行があります`,
      );
    }
    const amountText = cell("Charged Amount").replace(/,/g, "");
    const amount = Number(amountText);
    if (amountText === "" || !Number.isFinite(amount)) {
      throw new AdSourceError(
        `Google Play の ${month} の売上レポートに、金額（Charged Amount）が読めない行があります`,
      );
    }
    return {
      order: cell("Order Number"),
      date: jstDayKey(new Date(Number(timestamp) * 1000)),
      sku: cell("SKU ID"),
      title: cell("Product Title"),
      status: cell("Financial Status"),
      currency: cell("Currency of Sale"),
      amount,
    };
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function countBy(values: string[]): Map<string, number> {
  return values.reduce(
    (acc, v) => acc.set(v, (acc.get(v) ?? 0) + 1),
    new Map<string, number>(),
  );
}

function summarize(
  sales: Sale[],
  range: DayRange,
  earnings: ReadonlyMap<string, OrderEarnings>,
): AdDailyRow[] {
  const inRange = sales.filter(
    (s) => s.date >= range.from && s.date <= range.to,
  );

  // 返金などがどう届くかはまだ見ていない。推測で足し引きせず、止めて知らせる
  const others = countBy(
    inRange
      .filter((s) => s.status !== "Charged")
      .map((s) => s.status || "空欄"),
  );
  if (others.size > 0) {
    const list = [...others].map(([s, n]) => `${s} ${n}件`).join("・");
    throw new AdSourceError(
      `Google Play の売上レポートに課金以外の行（${list}）があります。扱いを決めるまで取り込みません`,
    );
  }
  const foreign = new Set(
    inRange
      .filter((s) => s.currency !== "JPY")
      .map((s) => s.currency || "不明"),
  );
  if (foreign.size > 0) {
    throw new AdSourceError(
      `Google Play の売上に日本円以外（${[...foreign].join("・")}）が含まれています。円への換算方法が決まるまで取り込みません`,
    );
  }
  if (inRange.some((s) => s.sku === "")) {
    throw new AdSourceError(
      "Google Play の売上レポートに、商品（SKU ID）が空の行があります",
    );
  }

  // 無料試用の開始などは0円で届く。売上に関係しない
  const charged = inRange.filter((s) => s.amount !== 0);
  const foreignEarnings = new Set(
    charged
      .map((s) => earnings.get(s.order)?.currency)
      .filter((c): c is string => c !== undefined && c !== "JPY"),
  );
  if (foreignEarnings.size > 0) {
    throw new AdSourceError(
      `Google Play の収益レポートの受取通貨が日本円以外（${[...foreignEarnings].join("・")}）です。円への換算方法が決まるまで取り込みません`,
    );
  }

  // 手取りは、その日・商品の注文が全部収益レポートに載ってから入れる（一部だけ足すと少なく見えるため）
  const byDayAndSku = charged.reduce((acc, s) => {
    const id = `${s.date}\t${s.sku}`;
    const row = acc.get(id);
    const settled = earnings.get(s.order);
    return acc.set(id, {
      date: s.date,
      key: s.sku,
      label: row?.label ?? (s.title || undefined),
      grossSales: (row?.grossSales ?? 0) + s.amount,
      proceeds:
        settled === undefined || (row !== undefined && row.proceeds === null)
          ? null
          : (row?.proceeds ?? 0) + settled.amount,
    });
  }, new Map<string, { date: string; key: string; label?: string; grossSales: number; proceeds: number | null }>());

  return [...byDayAndSku.values()]
    .map(({ grossSales, proceeds, ...row }) => ({
      ...row,
      metrics:
        proceeds === null
          ? { grossSales: round2(grossSales) }
          : { grossSales: round2(grossSales), proceeds: round2(proceeds) },
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

export async function fetchGooglePlayDaily(
  range: DayRange,
  env: Env,
  fetchImpl: FetchImpl = fetch,
  now: () => number = Date.now,
): Promise<AdDailyRow[]> {
  const creds = loadCredentials(env);
  const bucket = loadBucket(env);
  const token = await fetchAccessToken(creds, fetchImpl, now());
  const storage = { bucket, token, fetchImpl };
  const months = listMonths(range);
  const sales: Sale[] = [];
  for (const month of months) {
    const text = await fetchMonth(month, storage);
    if (text !== null) sales.push(...parseReport(text, month));
  }
  // 収益レポートは太平洋時間の月で区切られるので、月末の注文は翌月のファイルに載ることがある
  const perMonth: Map<string, OrderEarnings>[] = [];
  for (const month of [...months, nextMonth(months[months.length - 1])]) {
    perMonth.push(await fetchEarnings(month, storage));
  }
  return summarize(sales, range, mergeEarnings(...perMonth));
}
