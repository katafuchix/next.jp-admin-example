import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdmobDaily } from "./admob";
import { AdSourceError } from "./types";

const ENV = {
  ADMOB_CLIENT_ID: "client-id",
  ADMOB_CLIENT_SECRET: "client-secret-value",
  ADMOB_REFRESH_TOKEN: "refresh-token-value",
  ADMOB_PUBLISHER_ID: "pub-1234567890",
};
const RANGE = { from: "2026-09-17", to: "2026-09-23" };
const ACCOUNT_URL = "https://admob.googleapis.com/v1/accounts/pub-1234567890";
const REPORT_URL = `${ACCOUNT_URL}/networkReport:generate`;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** AdMob の networkReport:generate が返す形（header・row…・footer の配列） */
function report(rows: unknown[], matchingRowCount = rows.length) {
  return [
    {
      header: {
        dateRange: {
          startDate: { year: 2026, month: 9, day: 17 },
          endDate: { year: 2026, month: 9, day: 23 },
        },
        localizationSettings: { currencyCode: "JPY" },
      },
    },
    ...rows.map((row) => ({ row })),
    { footer: { matchingRowCount: String(matchingRowCount) } },
  ];
}

function bannerRow(date: string, earningsMicros: string) {
  return {
    dimensionValues: {
      DATE: { value: date },
      AD_UNIT: {
        value: "ca-app-pub-1234567890/111",
        displayLabel: "ホーム下部バナー",
      },
    },
    metricValues: {
      ESTIMATED_EARNINGS: { microsValue: earningsMicros },
      IMPRESSIONS: { integerValue: "1200" },
      CLICKS: { integerValue: "7" },
    },
  };
}

function fakeFetch({
  token = json({ access_token: "access-1", expires_in: 3599 }),
  account = json({
    name: "accounts/pub-1234567890",
    publisherId: "pub-1234567890",
    reportingTimeZone: "Asia/Tokyo",
    currencyCode: "JPY",
  }),
  reportResponse = json(report([bannerRow("20260920", "1234560000")])),
}: {
  token?: Response;
  account?: Response;
  reportResponse?: Response;
} = {}) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === TOKEN_URL) return token;
    if (url === ACCOUNT_URL) return account;
    if (url === REPORT_URL) return reportResponse;
    throw new Error(`想定外の URL: ${url}`);
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchAdmobDaily", () => {
  it("広告枠ごと・日ごとの収益（円）・表示回数・クリック数を返す", async () => {
    const fetchImpl = fakeFetch({
      reportResponse: json(
        report([
          bannerRow("20260920", "1234560000"),
          bannerRow("20260921", "0"),
        ]),
      ),
    });

    const rows = await fetchAdmobDaily(RANGE, ENV, fetchImpl);

    expect(rows).toEqual([
      {
        date: "2026-09-20",
        key: "ca-app-pub-1234567890/111",
        label: "ホーム下部バナー",
        metrics: { revenue: 1234.56, impressions: 1200, clicks: 7 },
      },
      {
        date: "2026-09-21",
        key: "ca-app-pub-1234567890/111",
        label: "ホーム下部バナー",
        metrics: { revenue: 0, impressions: 1200, clicks: 7 },
      },
    ]);
  });

  it("保存済みの承認でアクセストークンを取り直し、そのトークンでレポートを頼む", async () => {
    const fetchImpl = fakeFetch();

    await fetchAdmobDaily(RANGE, ENV, fetchImpl);

    const [, tokenInit] = fetchImpl.mock.calls.find(
      ([url]) => String(url) === TOKEN_URL,
    )!;
    const form = new URLSearchParams(String(tokenInit?.body));
    expect(tokenInit?.method).toBe("POST");
    expect(Object.fromEntries(form)).toEqual({
      client_id: "client-id",
      client_secret: "client-secret-value",
      refresh_token: "refresh-token-value",
      grant_type: "refresh_token",
    });

    const [, reportInit] = fetchImpl.mock.calls.find(
      ([url]) => String(url) === REPORT_URL,
    )!;
    expect(reportInit?.method).toBe("POST");
    expect(new Headers(reportInit?.headers).get("Authorization")).toBe(
      "Bearer access-1",
    );
    expect(JSON.parse(String(reportInit?.body))).toEqual({
      reportSpec: {
        dateRange: {
          startDate: { year: 2026, month: 9, day: 17 },
          endDate: { year: 2026, month: 9, day: 23 },
        },
        dimensions: ["DATE", "AD_UNIT"],
        metrics: ["ESTIMATED_EARNINGS", "IMPRESSIONS", "CLICKS"],
        localizationSettings: { currencyCode: "JPY" },
      },
    });
  });

  it("行が1件も無ければ空の配列", async () => {
    const fetchImpl = fakeFetch({ reportResponse: json(report([])) });

    await expect(fetchAdmobDaily(RANGE, ENV, fetchImpl)).resolves.toEqual([]);
  });

  it("レポートの時間帯が日本時間でなければ、日付がずれるので取り込まない", async () => {
    const fetchImpl = fakeFetch({
      account: json({
        name: "accounts/pub-1234567890",
        publisherId: "pub-1234567890",
        reportingTimeZone: "America/Los_Angeles",
        currencyCode: "USD",
      }),
    });

    const err = await fetchAdmobDaily(RANGE, ENV, fetchImpl).catch((e) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("America/Los_Angeles");
    expect(
      fetchImpl.mock.calls.some(([url]) => String(url) === REPORT_URL),
    ).toBe(false);
  });

  it("承認が切れていたら、秘密の値を出さずに失敗の理由を返す", async () => {
    const fetchImpl = fakeFetch({
      token: json(
        {
          error: "invalid_grant",
          error_description: "Token has been expired or revoked.",
        },
        400,
      ),
    });

    const err = await fetchAdmobDaily(RANGE, ENV, fetchImpl).catch((e) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("HTTP 400");
    expect(err.message).not.toContain("client-secret-value");
    expect(err.message).not.toContain("refresh-token-value");
  });

  it("アカウント情報が取れなければ失敗", async () => {
    const fetchImpl = fakeFetch({
      account: json({ error: { code: 403, status: "PERMISSION_DENIED" } }, 403),
    });

    const err = await fetchAdmobDaily(RANGE, ENV, fetchImpl).catch((e) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("HTTP 403");
  });

  it("レポートが取れなければ失敗", async () => {
    const fetchImpl = fakeFetch({
      reportResponse: json({ error: { code: 500, status: "INTERNAL" } }, 500),
    });

    const err = await fetchAdmobDaily(RANGE, ENV, fetchImpl).catch((e) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("HTTP 500");
  });

  it("行数の上限で打ち切られていたら、欠けたまま保存しない", async () => {
    const fetchImpl = fakeFetch({
      reportResponse: json(report([bannerRow("20260920", "1000000")], 2)),
    });

    const err = await fetchAdmobDaily(RANGE, ENV, fetchImpl).catch((e) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("2件中1件");
  });
});
