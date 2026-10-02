import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTenjinAdmobDaily } from "./tenjin-admob";
import { AdSourceError } from "./types";

const ENV = { TENJIN_API_KEY: "tenjin-token-value" };
const RANGE = { from: "2026-09-17", to: "2026-09-23" };
const AD_REVENUE_PATH = "/v2/reports/ad_revenue";
const FX_ORIGIN = "https://api.frankfurter.dev";
const IOS_APP = "8e30b0e6-d8aa-4b94-97c9-d00aa939be81";
const ANDROID_APP = "2bf639bf-ce42-4cbb-801c-b3a4f9c7edee";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** /v2/reports/ad_revenue（group_by=channel,app）の1行。既定値は 2026-09-17 の iOS の実際の応答 */
function revenueRow({
  date = "2026-09-17",
  networkId = 4,
  networkName = "Google AdMob",
  shortId = "ad_mob",
  appId = IOS_APP,
  platform = "ios",
  adRevenue = 1.1 as number | null,
  impressions = 479 as number | null,
  clicks = 5 as number | null,
} = {}) {
  return {
    id: `${date},${networkId},${appId}`,
    type: "report",
    attributes: {
      date,
      app_id: appId,
      app_name: "はぴけん",
      bundle_id: "hapiken.com",
      platform,
      ad_network_id: networkId,
      ad_network_name: networkName,
      ad_network_short_id: shortId,
      ad_network_custom: false,
      ad_revenue: adRevenue,
      impressions,
      clicks,
      ecpm: 2.2964509394572024,
      ecpc: 0.22,
    },
  };
}

/** 1ページぶんの応答。links.next は spend と同じく http で返ってくる前提 */
function page(data: unknown[], count = data.length, pageNo = 1) {
  return {
    data,
    links: {
      next: `http://api.tenjin.com${AD_REVENUE_PATH}?page=${pageNo + 1}&per_page=1000`,
    },
    meta: {
      count,
      metrics: ["ad_revenue", "impressions", "clicks", "ecpm", "ecpc"],
    },
  };
}

/** Frankfurter の米ドル→円の応答。既定値は 2026-09-17・18 の実際のレート */
function fxBody(
  rates: Record<string, number> = { "2026-09-17": 155.69, "2026-09-18": 157.89 },
) {
  return {
    amount: 1.0,
    base: "USD",
    rates: Object.fromEntries(
      Object.entries(rates).map(([date, jpy]) => [date, { JPY: jpy }]),
    ),
  };
}

/** Tenjin はページ番号ごとの応答、為替（Frankfurter）は fx を返す偽の fetch */
function fakeFetch(pages: Response[], fx: () => Response = () => json(fxBody())) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.origin === FX_ORIGIN) return fx();
    if (url.pathname !== AD_REVENUE_PATH) {
      throw new Error(`想定外の URL: ${url}`);
    }
    const res = pages[Number(url.searchParams.get("page")) - 1];
    if (!res) throw new Error(`想定外のページ: ${url}`);
    return res;
  });
}

/** Tenjin への呼び出しだけ */
function tenjinCalls(fetchImpl: ReturnType<typeof fakeFetch>) {
  return fetchImpl.mock.calls.filter(
    ([input]) => new URL(String(input)).origin !== FX_ORIGIN,
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchTenjinAdmobDaily", () => {
  it("AdMob の行だけを、アプリごと・日ごとの収益（米ドルをその日の為替で円に換算）・表示回数・クリック数にする", async () => {
    const fetchImpl = fakeFetch([
      json(
        page([
          revenueRow(),
          revenueRow({
            appId: ANDROID_APP,
            platform: "android",
            adRevenue: 9.21,
            impressions: 233,
            clicks: 19,
          }),
          // AdMob 以外の媒体が増えても AdMob として取り込まない
          revenueRow({
            networkId: 22725,
            networkName: "GMO SmaAD",
            shortId: "smaad",
            impressions: 800,
          }),
          revenueRow({
            date: "2026-09-18",
            adRevenue: null,
            impressions: null,
            clicks: null,
          }),
        ]),
      ),
    ]);

    const rows = await fetchTenjinAdmobDaily(RANGE, ENV, fetchImpl);

    expect(rows).toEqual([
      {
        date: "2026-09-17",
        key: `4:${IOS_APP}`,
        label: "Google AdMob（iOS）",
        // 1.1 ドル × 155.69 円（AdMob 管理画面の iOS 09-17 は 171円）
        metrics: { revenue: 171.26, impressions: 479, clicks: 5 },
      },
      {
        date: "2026-09-17",
        key: `4:${ANDROID_APP}`,
        label: "Google AdMob（Android）",
        // 9.21 ドル × 155.69 円（AdMob 管理画面の Android 09-17 は 1,433円）
        metrics: { revenue: 1433.9, impressions: 233, clicks: 19 },
      },
      {
        date: "2026-09-18",
        key: `4:${IOS_APP}`,
        label: "Google AdMob（iOS）",
        metrics: {},
      },
    ]);
  });

  it("トークンを Bearer で送り、期間・日別・媒体×アプリ・1ページ1000件で広告収益のレポートを頼む", async () => {
    const fetchImpl = fakeFetch([json(page([revenueRow()]))]);

    await fetchTenjinAdmobDaily(RANGE, ENV, fetchImpl);

    const [input, init] = tenjinCalls(fetchImpl)[0];
    const url = new URL(String(input));
    expect(url.origin).toBe("https://api.tenjin.com");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      start_date: "2026-09-17",
      end_date: "2026-09-23",
      granularity: "daily",
      group_by: "channel,app",
      per_page: "1000",
      page: "1",
    });
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer tenjin-token-value",
    );
  });

  it("件数が1ページに収まらなければ、https のまま次のページをたどって全件そろえる", async () => {
    const fetchImpl = fakeFetch([
      json(page([revenueRow()], 2, 1)),
      json(page([revenueRow({ date: "2026-09-18" })], 2, 2)),
    ]);

    const rows = await fetchTenjinAdmobDaily(RANGE, ENV, fetchImpl);

    expect(rows.map((r) => r.date)).toEqual(["2026-09-17", "2026-09-18"]);
    expect(
      tenjinCalls(fetchImpl).map(([input]) => {
        const url = new URL(String(input));
        return `${url.protocol}${url.searchParams.get("page")}`;
      }),
    ).toEqual(["https:1", "https:2"]);
  });

  it("件数に届かないうちにページが空になったら、欠けたまま保存しない", async () => {
    const fetchImpl = fakeFetch([
      json(page([revenueRow()], 3, 1)),
      json(page([], 3, 2)),
    ]);

    const err = await fetchTenjinAdmobDaily(RANGE, ENV, fetchImpl).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("3件中1件");
  });

  it("土日の収益は前の営業日のレートで換算する", async () => {
    const fetchImpl = fakeFetch([
      json(page([revenueRow({ date: "2026-09-19", adRevenue: 0.54 })])),
    ]);

    const rows = await fetchTenjinAdmobDaily(
      { from: "2026-09-19", to: "2026-09-19" },
      ENV,
      fetchImpl,
    );

    // 09-19 は土曜なので金曜 09-18 の 157.89 円
    expect(rows[0].metrics.revenue).toBe(85.26);
  });

  it("収益の入った行が無ければ、為替を取りに行かない", async () => {
    const fetchImpl = fakeFetch([
      json(page([revenueRow({ adRevenue: null })])),
    ]);

    const rows = await fetchTenjinAdmobDaily(RANGE, ENV, fetchImpl);

    expect(rows[0].metrics).toEqual({ impressions: 479, clicks: 5 });
    expect(fetchImpl.mock.calls).toHaveLength(tenjinCalls(fetchImpl).length);
  });

  it("為替が取れなければ、ドルのまま保存せずに失敗", async () => {
    const fetchImpl = fakeFetch([json(page([revenueRow()]))], () =>
      json({ message: "internal error" }, 503),
    );

    const err = await fetchTenjinAdmobDaily(RANGE, ENV, fetchImpl).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("為替");
  });

  it("行が1件も無ければ空の配列", async () => {
    const fetchImpl = fakeFetch([json(page([]))]);

    await expect(fetchTenjinAdmobDaily(RANGE, ENV, fetchImpl)).resolves.toEqual(
      [],
    );
  });

  it("認証に失敗したら、トークンを出さずに失敗の理由を返す", async () => {
    const fetchImpl = fakeFetch([
      json({ errors: [{ status: 401, title: "Unauthorized" }] }, 401),
    ]);

    const err = await fetchTenjinAdmobDaily(RANGE, ENV, fetchImpl).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("HTTP 401");
    expect(err.message).not.toContain("tenjin-token-value");
  });

  it("応答の形が想定と違えば失敗", async () => {
    const fetchImpl = fakeFetch([json({ message: "ok" })]);

    const err = await fetchTenjinAdmobDaily(RANGE, ENV, fetchImpl).catch(
      (e) => e,
    );

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("形");
  });
});
