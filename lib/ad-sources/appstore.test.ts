import { generateKeyPairSync, verify } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAppStoreDaily } from "./appstore";
import { AdSourceError } from "./types";

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
});
const PRIVATE_KEY_PEM = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

const ENV = {
  APPSTORE_ISSUER_ID: "issuer-123",
  APPSTORE_KEY_ID: "KEY123",
  APPSTORE_PRIVATE_KEY: PRIVATE_KEY_PEM,
  APPSTORE_VENDOR_NUMBER: "85012345",
};
const RANGE = { from: "2026-09-20", to: "2026-09-21" };
const NOW = Date.UTC(2026, 8, 23, 3, 0, 0);

/** Summary Sales Report（1_1 以降）の列。取り込みは列名で読むので順番には依存しない */
const HEADER = [
  "Provider",
  "Provider Country",
  "SKU",
  "Developer",
  "Title",
  "Version",
  "Product Type Identifier",
  "Units",
  "Developer Proceeds",
  "Begin Date",
  "End Date",
  "Customer Currency",
  "Country Code",
  "Currency of Proceeds",
  "Apple Identifier",
  "Customer Price",
  "Promo Code",
  "Parent Identifier",
  "Subscription",
  "Period",
  "Category",
  "CMB",
  "Device",
  "Supported Platforms",
  "Proceeds Reason",
  "Preserved Pricing",
  "Client",
  "Order Type",
];

interface SaleLine {
  sku: string;
  title: string;
  type: string;
  units: string;
  proceeds: string;
  price: string;
  date: string;
  currency?: string;
  device?: string;
}

function line(s: SaleLine) {
  const currency = s.currency ?? "JPY";
  const cells: Record<string, string> = {
    Provider: "APPLE",
    "Provider Country": "US",
    SKU: s.sku,
    Developer: "Hapiken Inc.",
    Title: s.title,
    "Product Type Identifier": s.type,
    Units: s.units,
    "Developer Proceeds": s.proceeds,
    "Begin Date": s.date,
    "End Date": s.date,
    "Customer Currency": currency,
    "Country Code": currency === "JPY" ? "JP" : "US",
    "Currency of Proceeds": currency,
    "Apple Identifier": "1234567890",
    "Customer Price": s.price,
    Device: s.device ?? "iPhone",
  };
  return HEADER.map((h) => cells[h] ?? "").join("\t");
}

function monthly(units: string, price: string, device?: string): SaleLine {
  return {
    sku: "hapiken.monthly",
    title: "jp.hapiken.monthly",
    type: "IAY",
    units,
    proceeds: "329",
    price,
    date: "09/20/2026",
    device,
  };
}

function gz(lines: string[], header = HEADER) {
  const tsv = [header.join("\t"), ...lines].join("\n") + "\n";
  return new Response(new Uint8Array(gzipSync(tsv)), {
    status: 200,
    headers: { "Content-Type": "application/a-gzip" },
  });
}

function notFound() {
  return new Response(
    JSON.stringify({
      errors: [
        {
          status: "404",
          code: "NOT_FOUND",
          title: "The specified resource does not exist",
          detail: "There were no sales for the date specified.",
        },
      ],
    }),
    { status: 404, headers: { "Content-Type": "application/json" } },
  );
}

function fakeFetch(byDate: Record<string, () => Response>) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const date = url.searchParams.get("filter[reportDate]") ?? "";
    const respond = byDate[date];
    if (!respond) throw new Error(`想定外の日付: ${date}`);
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
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(s, "base64url"),
    ),
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchAppStoreDaily", () => {
  it("商品（SKU）ごと・日ごとに税込売上と手取りを合計し、返金を差し引き、無料のダウンロードは除く", async () => {
    const fetchImpl = fakeFetch({
      "2026-09-20": () =>
        gz([
          line(monthly("3", "470")),
          line(monthly("1", "470", "iPad")),
          // 返金は「数量が負・顧客価格も負・手取り単価は正」で届く
          line(monthly("-1", "-470")),
          line({
            sku: "hapiken.yearly",
            title: "jp.hapiken.yearly",
            type: "IAY",
            units: "1",
            proceeds: "2100",
            price: "3000",
            date: "09/20/2026",
          }),
          line({
            sku: "hapiken.app",
            title: "はぴけん",
            type: "1F",
            units: "50",
            proceeds: "0",
            price: "0",
            date: "09/20/2026",
          }),
        ]),
      "2026-09-21": () =>
        gz([line({ ...monthly("2", "470"), date: "09/21/2026" })]),
    });

    const rows = await fetchAppStoreDaily(RANGE, ENV, fetchImpl, () => NOW);

    expect(rows).toEqual([
      {
        date: "2026-09-20",
        key: "hapiken.monthly",
        label: "jp.hapiken.monthly",
        metrics: { grossSales: 1410, proceeds: 987 },
      },
      {
        date: "2026-09-20",
        key: "hapiken.yearly",
        label: "jp.hapiken.yearly",
        metrics: { grossSales: 3000, proceeds: 2100 },
      },
      {
        date: "2026-09-21",
        key: "hapiken.monthly",
        label: "jp.hapiken.monthly",
        metrics: { grossSales: 940, proceeds: 658 },
      },
    ]);
  });

  it("日ごとに日次の売上サマリーを頼み、ES256 で署名したトークンを付ける", async () => {
    const fetchImpl = fakeFetch({
      "2026-09-20": () => gz([]),
      "2026-09-21": () => gz([]),
    });

    await fetchAppStoreDaily(RANGE, ENV, fetchImpl, () => NOW);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [input, init] = fetchImpl.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe(
      "https://api.appstoreconnect.apple.com/v1/salesReports",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      "filter[frequency]": "DAILY",
      "filter[reportType]": "SALES",
      "filter[reportSubType]": "SUMMARY",
      "filter[vendorNumber]": "85012345",
      "filter[reportDate]": "2026-09-20",
    });

    const auth = new Headers(init?.headers).get("Authorization") ?? "";
    expect(auth.startsWith("Bearer ")).toBe(true);
    const jwt = decodeJwt(auth.slice("Bearer ".length));
    expect(jwt.valid).toBe(true);
    expect(jwt.header).toEqual({ alg: "ES256", kid: "KEY123", typ: "JWT" });
    expect(jwt.payload).toMatchObject({
      iss: "issuer-123",
      aud: "appstoreconnect-v1",
      iat: NOW / 1000,
    });
    // Apple は20分より先の期限を受け付けない
    expect(jwt.payload.exp - jwt.payload.iat).toBeLessThanOrEqual(20 * 60);
  });

  it("環境変数に1行で入れた鍵（改行が \\n）でも署名できる", async () => {
    const fetchImpl = fakeFetch({
      "2026-09-20": () => gz([]),
      "2026-09-21": () => gz([]),
    });
    const env = {
      ...ENV,
      APPSTORE_PRIVATE_KEY: PRIVATE_KEY_PEM.replace(/\n/g, "\\n"),
    };

    await fetchAppStoreDaily(RANGE, env, fetchImpl, () => NOW);

    const auth = new Headers(fetchImpl.mock.calls[0][1]?.headers).get(
      "Authorization",
    );
    expect(decodeJwt(auth!.slice("Bearer ".length)).valid).toBe(true);
  });

  it("売上が無い日（404）はその日だけ0行にして、ほかの日は取り込む", async () => {
    const fetchImpl = fakeFetch({
      "2026-09-20": notFound,
      "2026-09-21": () =>
        gz([line({ ...monthly("1", "470"), date: "09/21/2026" })]),
    });

    const rows = await fetchAppStoreDaily(RANGE, ENV, fetchImpl, () => NOW);

    expect(rows.map((r) => r.date)).toEqual(["2026-09-21"]);
  });

  it("日本円以外の売上が混ざっていたら、換算せずに失敗する", async () => {
    const fetchImpl = fakeFetch({
      "2026-09-20": () =>
        gz([
          line(monthly("1", "470")),
          line({ ...monthly("1", "2.99"), currency: "USD" }),
        ]),
      "2026-09-21": () => gz([]),
    });

    const err = await fetchAppStoreDaily(
      RANGE,
      ENV,
      fetchImpl,
      () => NOW,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("USD");
  });

  it("認証に失敗したら、鍵を出さずに失敗の理由を返す", async () => {
    const fetchImpl = fakeFetch({
      "2026-09-20": () =>
        new Response(
          JSON.stringify({
            errors: [{ status: "401", code: "NOT_AUTHORIZED" }],
          }),
          { status: 401 },
        ),
    });

    const err = await fetchAppStoreDaily(
      RANGE,
      ENV,
      fetchImpl,
      () => NOW,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("HTTP 401");
    expect(err.message).not.toContain("PRIVATE KEY");
  });

  it("秘密鍵が読めなければ、リクエストを出さずに失敗する", async () => {
    const fetchImpl = fakeFetch({});

    const err = await fetchAppStoreDaily(
      RANGE,
      { ...ENV, APPSTORE_PRIVATE_KEY: "not-a-key" },
      fetchImpl,
      () => NOW,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).not.toContain("not-a-key");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("必要な列が無ければ、形が違うとして失敗する", async () => {
    const fetchImpl = fakeFetch({
      "2026-09-20": () =>
        gz(
          [],
          HEADER.filter((h) => h !== "Developer Proceeds"),
        ),
      "2026-09-21": () => gz([]),
    });

    const err = await fetchAppStoreDaily(
      RANGE,
      ENV,
      fetchImpl,
      () => NOW,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("Developer Proceeds");
  });

  it("頼んだ日と違う日の行が返ったら失敗する", async () => {
    const fetchImpl = fakeFetch({
      "2026-09-20": () =>
        gz([line({ ...monthly("1", "470"), date: "09/19/2026" })]),
      "2026-09-21": () => gz([]),
    });

    const err = await fetchAppStoreDaily(
      RANGE,
      ENV,
      fetchImpl,
      () => NOW,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("2026-09-20");
  });
});
