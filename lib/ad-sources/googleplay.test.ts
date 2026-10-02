import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeZip } from "./fixtures/make-zip";
import { fetchGooglePlayDaily } from "./googleplay";
import { AdSourceError } from "./types";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const PRIVATE_KEY_PEM = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

/** Google Cloud でダウンロードするサービスアカウントの鍵（JSON）と同じ形 */
const SERVICE_ACCOUNT = {
  type: "service_account",
  project_id: "hapiken-admin",
  private_key_id: "key-id-123",
  private_key: PRIVATE_KEY_PEM,
  client_email: "sales-reader@hapiken-admin.iam.gserviceaccount.com",
  client_id: "1234567890",
  token_uri: "https://oauth2.googleapis.com/token",
};
const BUCKET = "pubsite_prod_1234567890";
const ENV = {
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT),
  GOOGLE_PLAY_REPORTS_BUCKET: BUCKET,
};
const RANGE = { from: "2026-09-20", to: "2026-09-21" };
const NOW = Date.UTC(2026, 8, 25, 3, 0, 0);
const TOKEN = "ya29.test-access-token";

/** 売上レポート（sales/salesreport_YYYYMM.zip）の列。取り込みは列名で読む */
const HEADER = [
  "Order Number",
  "Order Charged Date",
  "Order Charged Timestamp",
  "Financial Status",
  "Device Model",
  "Product Title",
  "Package ID",
  "Product Type",
  "SKU ID",
  "Currency of Sale",
  "Item Price",
  "Taxes Collected",
  "Charged Amount",
  "City of Buyer",
  "State of Buyer",
  "Postal Code of Buyer",
  "Country of Buyer",
  "Base Plan or Purchase Option ID",
  "Offer ID",
  "Group ID",
  "First USD 1M Eligible",
  "Promotion ID",
  "Coupon Value",
  "Discount Rate",
  "Featured Product ID",
  "Price Experiment ID",
  "Sales Channel",
];

const MONTHLY = {
  sku: "hapiken.com.premium.monthly",
  title: "PREMIUM_月額プラン (はぴけん)",
};
const YEARLY = {
  sku: "hapiken.com.premium.yearly",
  title: "PREMIUM_年額プラン, お得 (はぴけん)",
};
/** 購入者の住所。取り込みはこの列を読まないので、結果にもエラーにも出てはいけない */
const BUYER_CITY = "港区シークレット";
const BUYER_POSTAL = "106-0099";

interface Sale {
  /** 日本時間の日時 "YYYY-MM-DDTHH:mm" */
  jst: string;
  product: { sku: string; title: string };
  amount: string;
  status?: string;
  currency?: string;
}

const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;

function line(s: Sale, n: number) {
  const ts = Date.parse(`${s.jst}:00+09:00`) / 1000;
  const cells: Record<string, string> = {
    "Order Number": orderNo(n),
    "Order Charged Date": new Date(ts * 1000).toISOString().slice(0, 10),
    "Order Charged Timestamp": String(ts),
    "Financial Status": s.status ?? "Charged",
    "Device Model": "Pixel 9",
    "Product Title": quote(s.product.title),
    "Package ID": "hapiken.com",
    "Product Type": "Subscription",
    "SKU ID": s.product.sku,
    "Currency of Sale": s.currency ?? "JPY",
    "Item Price": s.amount,
    "Taxes Collected": "0.00",
    "Charged Amount": s.amount,
    "City of Buyer": quote(BUYER_CITY),
    "State of Buyer": "Tokyo",
    "Postal Code of Buyer": BUYER_POSTAL,
    "Country of Buyer": "JP",
    "Base Plan or Purchase Option ID": "hapiken-monthly",
    "First USD 1M Eligible": "No",
    "Sales Channel": "In-app",
  };
  return HEADER.map((h) => cells[h] ?? "").join(",");
}

function csv(sales: Sale[], header = HEADER) {
  return (
    [header.join(","), ...sales.map((s, i) => line(s, i))].join("\n") + "\n"
  );
}

function report(sales: Sale[], header = HEADER) {
  return reportOf(Buffer.from(csv(sales, header), "utf8"));
}

function reportOf(data: Buffer, name = "salesreport_202609.csv") {
  return new Response(new Uint8Array(makeZip([{ name, data }])), {
    status: 200,
    headers: { "Content-Type": "application/zip" },
  });
}

function storageError(status: number, message: string) {
  return new Response(
    JSON.stringify({ error: { code: status, message, errors: [] } }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

const noReport = () =>
  storageError(404, `No such object: ${BUCKET}/sales/salesreport_202610.zip`);

function tokenOk() {
  return new Response(
    JSON.stringify({
      access_token: TOKEN,
      expires_in: 3599,
      token_type: "Bearer",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** 収益レポート（earnings/earnings_YYYYMM_….zip）の列。取り込みは列名で読む */
const EARNINGS_HEADER = [
  "Description",
  "Transaction Date",
  "Transaction Time",
  "Tax Type",
  "Transaction Type",
  "Refund Type",
  "Product Title",
  "Product id",
  "Product Type",
  "Sku Id",
  "Hardware",
  "Buyer Country",
  "Buyer State",
  "Buyer Postal Code",
  "Buyer Currency",
  "Amount (Buyer Currency)",
  "Currency Conversion Rate",
  "Merchant Currency",
  "Amount (Merchant Currency)",
];

/** 売上レポートの n 行目（0始まり）の注文番号 */
const orderNo = (n: number) => `GPA.3300-0000-0000-${String(n).padStart(5, "0")}`;

interface EarningsLine {
  order: string;
  type: string;
  amount: string;
  currency?: string;
}

function earningsCsv(lines: EarningsLine[]) {
  const row = (e: EarningsLine) => {
    const cells: Record<string, string> = {
      Description: e.order,
      "Transaction Date": quote("Sep 11, 2026"),
      "Transaction Time": "8:12:34 AM PDT",
      "Transaction Type": e.type,
      "Product Title": quote(MONTHLY.title),
      "Product id": "hapiken.com",
      "Sku Id": MONTHLY.sku,
      "Buyer Country": "JP",
      "Buyer Postal Code": BUYER_POSTAL,
      "Buyer Currency": "JPY",
      "Amount (Buyer Currency)": e.amount,
      "Currency Conversion Rate": "1.000000",
      "Merchant Currency": e.currency ?? "JPY",
      "Amount (Merchant Currency)": e.amount,
    };
    return EARNINGS_HEADER.map((h) => cells[h] ?? "").join(",");
  };
  return [EARNINGS_HEADER.join(","), ...lines.map(row)].join("\n") + "\n";
}

/** 月（YYYYMM）ごとの売上レポート、収益レポート（ファイル名→CSV）、トークンの応答を返す fetch */
function fakeFetch(
  byMonth: Record<string, () => Response>,
  token: () => Response = tokenOk,
  earnings: Record<string, Record<string, string>> = {},
) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.href === "https://oauth2.googleapis.com/token") return token();
    const prefix = url.searchParams.get("prefix");
    if (prefix !== null) {
      const month = /^earnings\/earnings_(\d{6})$/.exec(prefix)?.[1];
      if (!month) throw new Error(`想定外の一覧: ${url.href}`);
      const items = Object.keys(earnings[month] ?? {}).map((file) => ({
        name: `earnings/${file}`,
      }));
      return new Response(JSON.stringify(items.length ? { items } : {}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const earningsFile = /^.*\/o\/earnings\/(earnings_(\d{6})_.+\.zip)$/.exec(
      decodeURIComponent(url.pathname),
    );
    if (earningsFile) {
      const text = earnings[earningsFile[2]]?.[earningsFile[1]];
      if (text === undefined) throw new Error(`想定外の URL: ${url.href}`);
      return reportOf(
        Buffer.from(text, "utf8"),
        earningsFile[1].replace(/\.zip$/, ".csv"),
      );
    }
    const month = /salesreport_(\d{6})\.zip$/.exec(
      decodeURIComponent(url.pathname),
    )?.[1];
    const respond = month ? byMonth[month] : undefined;
    if (!respond) throw new Error(`想定外の URL: ${url.href}`);
    return respond();
  });
}

function decodeJwt(token: string) {
  const [h, p, s] = token.split(".");
  const part = (v: string) =>
    JSON.parse(Buffer.from(v, "base64url").toString());
  return {
    header: part(h),
    payload: part(p),
    valid: verify(
      "sha256",
      Buffer.from(`${h}.${p}`),
      publicKey,
      Buffer.from(s, "base64url"),
    ),
  };
}

async function failure(fetchImpl: typeof fetch, env = ENV, range = RANGE) {
  return fetchGooglePlayDaily(range, env, fetchImpl, () => NOW).catch((e) => e);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchGooglePlayDaily", () => {
  it("注文の時刻から日本時間の日で区切り、商品（SKU）ごとに税込売上を合計する。0円の行と期間外は除く", async () => {
    const fetchImpl = fakeFetch({
      "202609": () =>
        report([
          { jst: "2026-09-19T20:00", product: MONTHLY, amount: "470.00" },
          { jst: "2026-09-20T10:00", product: MONTHLY, amount: "470.00" },
          { jst: "2026-09-20T12:00", product: YEARLY, amount: "3000.00" },
          // 無料試用の開始は0円で届く
          { jst: "2026-09-20T13:00", product: MONTHLY, amount: "0.00" },
          { jst: "2026-09-20T23:30", product: MONTHLY, amount: "470.00" },
          // UTC では 9/20（Order Charged Date も 9/20）だが、日本時間では 9/21
          { jst: "2026-09-21T00:30", product: MONTHLY, amount: "470.00" },
          { jst: "2026-09-22T09:00", product: MONTHLY, amount: "470.00" },
        ]),
    });

    const rows = await fetchGooglePlayDaily(RANGE, ENV, fetchImpl, () => NOW);

    // 手取りはこのレポートに無いので、行に入れない（未接続として扱う）
    expect(rows).toEqual([
      {
        date: "2026-09-20",
        key: MONTHLY.sku,
        label: MONTHLY.title,
        metrics: { grossSales: 940 },
      },
      {
        date: "2026-09-20",
        key: YEARLY.sku,
        label: YEARLY.title,
        metrics: { grossSales: 3000 },
      },
      {
        date: "2026-09-21",
        key: MONTHLY.sku,
        label: MONTHLY.title,
        metrics: { grossSales: 470 },
      },
    ]);
  });

  it("期間の前日の月から最後の月までのレポートを取り、月をまたぐ日の売上をまとめる", async () => {
    const fetchImpl = fakeFetch({
      "202608": () =>
        report([
          { jst: "2026-08-31T20:00", product: MONTHLY, amount: "470.00" },
          // UTC では 8/31 なので8月のファイルに入る
          { jst: "2026-09-01T00:30", product: MONTHLY, amount: "470.00" },
        ]),
      "202609": () =>
        report([
          { jst: "2026-09-01T10:00", product: MONTHLY, amount: "470.00" },
          { jst: "2026-09-30T23:00", product: YEARLY, amount: "3000.00" },
        ]),
      // まだ出ていない月
      "202610": noReport,
    });

    const rows = await fetchGooglePlayDaily(
      { from: "2026-09-01", to: "2026-10-01" },
      ENV,
      fetchImpl,
      () => NOW,
    );

    expect(rows).toEqual([
      {
        date: "2026-09-01",
        key: MONTHLY.sku,
        label: MONTHLY.title,
        metrics: { grossSales: 940 },
      },
      {
        date: "2026-09-30",
        key: YEARLY.sku,
        label: YEARLY.title,
        metrics: { grossSales: 3000 },
      },
    ]);
    const urls = fetchImpl.mock.calls.map(([input]) => String(input));
    expect(urls).toEqual([
      "https://oauth2.googleapis.com/token",
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/sales%2Fsalesreport_202608.zip?alt=media`,
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/sales%2Fsalesreport_202609.zip?alt=media`,
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/sales%2Fsalesreport_202610.zip?alt=media`,
      // 収益レポートは売上の月と、その翌月（月末の注文が載ることがある）を探す
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=earnings%2Fearnings_202608`,
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=earnings%2Fearnings_202609`,
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=earnings%2Fearnings_202610`,
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=earnings%2Fearnings_202611`,
    ]);
    for (const [, init] of fetchImpl.mock.calls.slice(1)) {
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${TOKEN}`,
      );
    }
  });

  it("サービスアカウントの鍵で RS256 に署名し、読み取り専用の権限だけを頼んでトークンを取る", async () => {
    const fetchImpl = fakeFetch({ "202609": () => report([]) });

    await fetchGooglePlayDaily(RANGE, ENV, fetchImpl, () => NOW);

    const [input, init] = fetchImpl.mock.calls[0];
    expect(String(input)).toBe("https://oauth2.googleapis.com/token");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    );
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    const jwt = decodeJwt(body.get("assertion") ?? "");
    expect(jwt.valid).toBe(true);
    expect(jwt.header).toEqual({ alg: "RS256", typ: "JWT", kid: "key-id-123" });
    expect(jwt.payload).toEqual({
      iss: SERVICE_ACCOUNT.client_email,
      scope: "https://www.googleapis.com/auth/devstorage.read_only",
      aud: "https://oauth2.googleapis.com/token",
      iat: NOW / 1000,
      exp: NOW / 1000 + 3600,
    });
  });

  it("鍵の JSON を base64 にしたものや、gs:// 付きのバケット名でも読める", async () => {
    const fetchImpl = fakeFetch({
      "202609": () =>
        report([
          { jst: "2026-09-20T10:00", product: MONTHLY, amount: "470.00" },
        ]),
    });
    const env = {
      GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: Buffer.from(
        JSON.stringify(SERVICE_ACCOUNT),
      ).toString("base64"),
      GOOGLE_PLAY_REPORTS_BUCKET: ` gs://${BUCKET}/ `,
    };

    const rows = await fetchGooglePlayDaily(RANGE, env, fetchImpl, () => NOW);

    expect(rows).toHaveLength(1);
    expect(String(fetchImpl.mock.calls[1][0])).toContain(`/b/${BUCKET}/o/`);
  });

  it("UTF-16 の BOM 付きで届いたレポートも読める", async () => {
    const text = csv([
      { jst: "2026-09-20T10:00", product: MONTHLY, amount: "470.00" },
    ]);
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(text, "utf16le"),
    ]);
    const fetchImpl = fakeFetch({ "202609": () => reportOf(utf16) });

    const rows = await fetchGooglePlayDaily(RANGE, ENV, fetchImpl, () => NOW);

    expect(rows).toEqual([
      {
        date: "2026-09-20",
        key: MONTHLY.sku,
        label: MONTHLY.title,
        metrics: { grossSales: 470 },
      },
    ]);
  });

  it("購入者の住所の列は読まず、結果にもログにも出さない", async () => {
    const fetchImpl = fakeFetch({
      "202609": () =>
        report([
          { jst: "2026-09-20T10:00", product: MONTHLY, amount: "470.00" },
          {
            jst: "2026-09-20T11:00",
            product: MONTHLY,
            amount: "470.00",
            status: "Refund",
          },
        ]),
    });

    const err = await failure(fetchImpl);

    const logged = JSON.stringify([
      vi.mocked(console.error).mock.calls,
      vi.mocked(console.warn).mock.calls,
    ]);
    for (const secret of [BUYER_CITY, BUYER_POSTAL]) {
      expect(err.message).not.toContain(secret);
      expect(logged).not.toContain(secret);
    }
  });

  it("期間内に課金（Charged）以外の行があれば、状態と件数を添えて失敗する", async () => {
    const refund = (jst: string): Sale => ({
      jst,
      product: MONTHLY,
      amount: "470.00",
      status: "Refund",
    });
    const fetchImpl = fakeFetch({
      "202609": () =>
        report([
          { jst: "2026-09-20T10:00", product: MONTHLY, amount: "470.00" },
          refund("2026-09-20T15:00"),
          refund("2026-09-21T09:00"),
          // 期間外の行は数えない
          refund("2026-09-03T10:00"),
        ]),
    });

    const err = await failure(fetchImpl);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("Refund 2件");
  });

  it("期間外の行は、課金以外や日本円以外でも取り込みを止めない", async () => {
    const fetchImpl = fakeFetch({
      "202609": () =>
        report([
          {
            jst: "2026-09-03T10:00",
            product: MONTHLY,
            amount: "470.00",
            status: "Refund",
          },
          {
            jst: "2026-09-04T10:00",
            product: MONTHLY,
            amount: "2.99",
            currency: "USD",
          },
          { jst: "2026-09-20T10:00", product: MONTHLY, amount: "470.00" },
        ]),
    });

    const rows = await fetchGooglePlayDaily(RANGE, ENV, fetchImpl, () => NOW);

    expect(rows).toHaveLength(1);
  });

  it("日本円以外の売上が混ざっていたら、換算せずに失敗する", async () => {
    const fetchImpl = fakeFetch({
      "202609": () =>
        report([
          { jst: "2026-09-20T10:00", product: MONTHLY, amount: "470.00" },
          {
            jst: "2026-09-20T11:00",
            product: MONTHLY,
            amount: "2.99",
            currency: "USD",
          },
        ]),
    });

    const err = await failure(fetchImpl);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("USD");
  });

  it("必要な列が無ければ、形が違うとして失敗する", async () => {
    const fetchImpl = fakeFetch({
      "202609": () =>
        report(
          [],
          HEADER.filter((h) => h !== "Charged Amount"),
        ),
    });

    const err = await failure(fetchImpl);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("Charged Amount");
  });

  it("ZIP の中に CSV が無ければ失敗する", async () => {
    const fetchImpl = fakeFetch({
      "202609": () => reportOf(Buffer.from("x"), "readme.txt"),
    });

    const err = await failure(fetchImpl);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("CSV");
  });

  it("鍵の JSON が読めなければ、中身を出さずリクエストの前に失敗する", async () => {
    for (const value of [
      "not-json-secret",
      JSON.stringify({ ...SERVICE_ACCOUNT, private_key: "not-a-key" }),
      JSON.stringify({ ...SERVICE_ACCOUNT, client_email: undefined }),
    ]) {
      const fetchImpl = fakeFetch({});

      const err = await failure(fetchImpl, {
        ...ENV,
        GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: value,
      });

      expect(err).toBeInstanceOf(AdSourceError);
      expect(err.message).not.toContain("not-json-secret");
      expect(err.message).not.toContain("not-a-key");
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it("バケット名が読めなければ、リクエストの前に失敗する", async () => {
    const fetchImpl = fakeFetch({});

    const err = await failure(fetchImpl, {
      ...ENV,
      GOOGLE_PLAY_REPORTS_BUCKET: "https://evil.example.com/x",
    });

    expect(err).toBeInstanceOf(AdSourceError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("認証に失敗したら、鍵を出さずに失敗の理由を返す", async () => {
    const fetchImpl = fakeFetch(
      {},
      () =>
        new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Invalid JWT Signature.",
          }),
          { status: 400 },
        ),
    );

    const err = await failure(fetchImpl);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("HTTP 400");
    expect(err.message).not.toContain("PRIVATE KEY");
  });

  it("レポートを読む権限がまだ無い（403）ときは、招待の反映待ちの可能性を伝える", async () => {
    const fetchImpl = fakeFetch({
      "202609": () =>
        storageError(
          403,
          `${SERVICE_ACCOUNT.client_email} does not have storage.objects.get access to the Google Cloud Storage object.`,
        ),
    });

    const err = await failure(fetchImpl);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("HTTP 403");
    expect(err.message).toContain("権限");
  });

  it("バケットそのものが見つからない 404 は、レポートが無い月として扱わずに失敗する", async () => {
    const fetchImpl = fakeFetch({
      "202609": () => storageError(404, "The specified bucket does not exist."),
    });

    const err = await failure(fetchImpl);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("バケット");
  });
  describe("手取り（収益レポート）", () => {
    const EARNINGS_FILE = "earnings_202609_1234567890-1.zip";

    it("注文番号で収益レポートを引き当て、手数料・税を差し引いた額を日・商品ごとの手取りにする", async () => {
      const fetchImpl = fakeFetch(
        {
          "202609": () =>
            report([
              { jst: "2026-09-20T10:00", product: MONTHLY, amount: "470.00" },
              { jst: "2026-09-20T12:00", product: MONTHLY, amount: "470.00" },
            ]),
        },
        tokenOk,
        {
          "202609": {
            [EARNINGS_FILE]: earningsCsv([
              { order: orderNo(0), type: "Charge", amount: "470" },
              { order: orderNo(0), type: "Google fee", amount: "-70.5" },
              { order: orderNo(1), type: "Charge", amount: "470" },
              { order: orderNo(1), type: "Google fee", amount: "-70.5" },
              // 期間の外の注文は読まない
              { order: "GPA.9999-0000-0000-00000", type: "Charge", amount: "3000" },
            ]),
          },
        },
      );

      const rows = await fetchGooglePlayDaily(RANGE, ENV, fetchImpl, () => NOW);

      expect(rows).toEqual([
        {
          date: "2026-09-20",
          key: MONTHLY.sku,
          label: MONTHLY.title,
          metrics: { grossSales: 940, proceeds: 799 },
        },
      ]);
    });

    it("収益レポートがまだ出ていない注文を含む日・商品は、手取りを入れない（一部だけ足して少なく見せない）", async () => {
      const fetchImpl = fakeFetch(
        {
          "202609": () =>
            report([
              { jst: "2026-09-20T10:00", product: MONTHLY, amount: "470.00" },
              { jst: "2026-09-20T12:00", product: MONTHLY, amount: "470.00" },
              { jst: "2026-09-21T12:00", product: YEARLY, amount: "3000.00" },
            ]),
        },
        tokenOk,
        {
          "202609": {
            [EARNINGS_FILE]: earningsCsv([
              { order: orderNo(0), type: "Charge", amount: "399.5" },
            ]),
          },
        },
      );

      const rows = await fetchGooglePlayDaily(RANGE, ENV, fetchImpl, () => NOW);

      expect(rows.map((r) => r.metrics)).toEqual([
        { grossSales: 940 },
        { grossSales: 3000 },
      ]);
    });

    it("月末の注文が翌月の収益レポートに載っていても、複数のファイルに分かれていても合計する", async () => {
      const fetchImpl = fakeFetch(
        {
          "202609": () =>
            report([
              { jst: "2026-09-30T23:00", product: MONTHLY, amount: "470.00" },
            ]),
          "202610": noReport,
        },
        tokenOk,
        {
          "202610": {
            "earnings_202610_1234567890-1.zip": earningsCsv([
              { order: orderNo(0), type: "Charge", amount: "470" },
            ]),
            "earnings_202610_1234567890-2.zip": earningsCsv([
              { order: orderNo(0), type: "Google fee", amount: "-70.5" },
            ]),
          },
        },
      );

      const rows = await fetchGooglePlayDaily(
        { from: "2026-09-30", to: "2026-09-30" },
        ENV,
        fetchImpl,
        () => NOW,
      );

      expect(rows[0].metrics).toEqual({ grossSales: 470, proceeds: 399.5 });
    });

    it("受取通貨が日本円以外なら、換算せずに失敗する", async () => {
      const fetchImpl = fakeFetch(
        {
          "202609": () =>
            report([
              { jst: "2026-09-20T10:00", product: MONTHLY, amount: "470.00" },
            ]),
        },
        tokenOk,
        {
          "202609": {
            [EARNINGS_FILE]: earningsCsv([
              { order: orderNo(0), type: "Charge", amount: "3.1", currency: "USD" },
            ]),
          },
        },
      );

      const err = await failure(fetchImpl);

      expect(err).toBeInstanceOf(AdSourceError);
      expect(err.message).toContain("USD");
    });

    it("必要な列が無い収益レポートは、形が違うとして失敗する。購入者の郵便番号は出さない", async () => {
      const fetchImpl = fakeFetch(
        {
          "202609": () =>
            report([
              { jst: "2026-09-20T10:00", product: MONTHLY, amount: "470.00" },
            ]),
        },
        tokenOk,
        {
          "202609": {
            [EARNINGS_FILE]: `Description,Buyer Postal Code,Amount\n${orderNo(0)},${BUYER_POSTAL},470\n`,
          },
        },
      );

      const err = await failure(fetchImpl);

      expect(err).toBeInstanceOf(AdSourceError);
      expect(err.message).toContain("Merchant Currency");
      expect(err.message).not.toContain(BUYER_POSTAL);
    });

    it("収益レポートの一覧を読む権限が無い（403）ときは、権限の理由で失敗する", async () => {
      const base = fakeFetch({ "202609": () => report([]) });
      const fetchImpl = vi.fn<typeof fetch>(async (input, init) =>
        new URL(String(input)).searchParams.has("prefix")
          ? storageError(403, "does not have storage.objects.list access")
          : base(input, init),
      );

      const err = await failure(fetchImpl);

      expect(err).toBeInstanceOf(AdSourceError);
      expect(err.message).toContain("HTTP 403");
    });
  });
});
