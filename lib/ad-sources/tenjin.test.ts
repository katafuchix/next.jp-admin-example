import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchTenjinDaily } from "./tenjin";
import { AdSourceError } from "./types";

const ENV = { TENJIN_API_KEY: "tenjin-token-value" };
const RANGE = { from: "2026-09-17", to: "2026-09-23" };
const SPEND_PATH = "/v2/reports/spend";
const IOS_APP = "8e30b0e6-d8aa-4b94-97c9-d00aa939be81";
const ANDROID_APP = "2bf639bf-ce42-4cbb-801c-b3a4f9c7edee";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** /v2/reports/spend（group_by=channel,app）の1行。実際の応答から要る項目だけ残した形 */
function spendRow({
  date = "2026-09-17",
  networkId = 22725,
  networkName = "GMO SmaAD",
  appId = IOS_APP,
  platform = "ios",
  spend = null as number | null,
  trackedInstalls = 127 as number | null,
} = {}) {
  return {
    id: `${date},${networkId},${appId}`,
    type: "report",
    attributes: {
      date,
      ad_network_id: networkId,
      app_id: appId,
      app_name: "はぴけん",
      ad_network_name: networkName,
      platform,
      bundle_id: "hapiken.com",
      spend,
      installs: null,
      cpi: null,
      tracked_installs: trackedInstalls,
      tcpi: null,
    },
  };
}

/** 1ページぶんの応答。links.next は実際の応答どおり http で返ってくる */
function page(data: unknown[], count = data.length, pageNo = 1) {
  return {
    data,
    links: {
      next: `http://api.tenjin.com${SPEND_PATH}?page=${pageNo + 1}&per_page=1000`,
    },
    meta: { count, group_by: "ad_network_app" },
  };
}

/** ページ番号ごとの応答を返す偽の fetch */
function fakeFetch(pages: Response[]) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname !== SPEND_PATH) {
      throw new Error(`想定外の URL: ${url}`);
    }
    const res = pages[Number(url.searchParams.get("page")) - 1];
    if (!res) throw new Error(`想定外のページ: ${url}`);
    return res;
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchTenjinDaily", () => {
  it("媒体・アプリごと・日ごとの広告経由インストール数を返し、Organic は除く", async () => {
    const fetchImpl = fakeFetch([
      json(
        page([
          spendRow(),
          spendRow({
            appId: ANDROID_APP,
            platform: "android",
            trackedInstalls: 117,
          }),
          spendRow({
            networkId: 0,
            networkName: "Organic",
            appId: ANDROID_APP,
            platform: "android",
            trackedInstalls: 2,
          }),
          spendRow({ date: "2026-09-18", trackedInstalls: null }),
        ]),
      ),
    ]);

    const rows = await fetchTenjinDaily(RANGE, ENV, fetchImpl);

    expect(rows).toEqual([
      {
        date: "2026-09-17",
        key: `22725:${IOS_APP}`,
        label: "GMO SmaAD（iOS）",
        metrics: { installs: 127 },
      },
      {
        date: "2026-09-17",
        key: `22725:${ANDROID_APP}`,
        label: "GMO SmaAD（Android）",
        metrics: { installs: 117 },
      },
      {
        date: "2026-09-18",
        key: `22725:${IOS_APP}`,
        label: "GMO SmaAD（iOS）",
        metrics: {},
      },
    ]);
  });

  it("トークンを Bearer で送り、期間・日別・媒体×アプリ・1ページ1000件で頼む", async () => {
    const fetchImpl = fakeFetch([json(page([spendRow()]))]);

    await fetchTenjinDaily(RANGE, ENV, fetchImpl);

    const [input, init] = fetchImpl.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin).toBe("https://api.tenjin.com");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      start_date: "2026-09-17",
      end_date: "2026-09-23",
      granularity: "daily",
      group_by: "channel,app",
      metrics: "spend,tracked_installs",
      per_page: "1000",
      page: "1",
    });
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer tenjin-token-value",
    );
  });

  it("件数が1ページに収まらなければ、https のまま次のページをたどって全件そろえる", async () => {
    const fetchImpl = fakeFetch([
      json(page([spendRow()], 2, 1)),
      json(page([spendRow({ date: "2026-09-18" })], 2, 2)),
    ]);

    const rows = await fetchTenjinDaily(RANGE, ENV, fetchImpl);

    expect(rows.map((r) => r.date)).toEqual(["2026-09-17", "2026-09-18"]);
    expect(
      fetchImpl.mock.calls.map(([input]) => {
        const url = new URL(String(input));
        return `${url.protocol}${url.searchParams.get("page")}`;
      }),
    ).toEqual(["https:1", "https:2"]);
  });

  it("件数に届かないうちにページが空になったら、欠けたまま保存しない", async () => {
    const fetchImpl = fakeFetch([
      json(page([spendRow()], 3, 1)),
      json(page([], 3, 2)),
    ]);

    const err = await fetchTenjinDaily(RANGE, ENV, fetchImpl).catch((e) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("3件中1件");
  });

  it("広告費が入っていても止めず、広告費は捨ててインストール数だけ取り込む", async () => {
    const fetchImpl = fakeFetch([
      json(
        page([
          spendRow({
            date: "2026-09-23",
            networkId: 1234,
            networkName: "Circuit X",
            spend: 57.44,
            trackedInstalls: null,
          }),
          spendRow({ date: "2026-09-23", spend: 1234.5, trackedInstalls: 98 }),
        ]),
      ),
    ]);

    const rows = await fetchTenjinDaily(RANGE, ENV, fetchImpl);

    expect(rows).toEqual([
      {
        date: "2026-09-23",
        key: `1234:${IOS_APP}`,
        label: "Circuit X（iOS）",
        metrics: {},
      },
      {
        date: "2026-09-23",
        key: `22725:${IOS_APP}`,
        label: "GMO SmaAD（iOS）",
        metrics: { installs: 98 },
      },
    ]);
  });

  it("行が1件も無ければ空の配列", async () => {
    const fetchImpl = fakeFetch([json(page([]))]);

    await expect(fetchTenjinDaily(RANGE, ENV, fetchImpl)).resolves.toEqual([]);
  });

  it("認証に失敗したら、トークンを出さずに失敗の理由を返す", async () => {
    const fetchImpl = fakeFetch([
      json({ errors: [{ status: 401, title: "Unauthorized" }] }, 401),
    ]);

    const err = await fetchTenjinDaily(RANGE, ENV, fetchImpl).catch((e) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("HTTP 401");
    expect(err.message).not.toContain("tenjin-token-value");
  });

  it("応答の形が想定と違えば失敗", async () => {
    const fetchImpl = fakeFetch([json({ message: "ok" })]);

    const err = await fetchTenjinDaily(RANGE, ENV, fetchImpl).catch((e) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("形");
  });
});
