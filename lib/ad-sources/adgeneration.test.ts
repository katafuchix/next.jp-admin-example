import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdGenerationDaily } from "./adgeneration";
import { AdSourceError } from "./types";

const ENV = {
  ADGENERATION_EMAIL: "api-user@example.com",
  ADGENERATION_PASSWORD: "password-value",
};
const RANGE = { from: "2026-09-16", to: "2026-09-23" };
const TOKEN = "jwt-token-value";
const TOKEN_URL = "https://ad-generation.jp/api/v2/tokens.json";
const REPORT_PATH = "/api/v2/report/performances.json";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** performances.json（dimensions[]=ad_placement）の1行。形は公式仕様（swagger v2）の Performance */
function perf({
  date = "2026-09-20",
  placementId = 172_001,
  placementName = "はぴけん iOS",
  revenue = 0.42 as number | null,
  impression = 3 as number | null,
  click = 1 as number | null,
  currency = "JPY",
} = {}) {
  return {
    date,
    ad_placement_id: placementId,
    ad_placement_name: placementName,
    revenue,
    currency,
    impression,
    click,
  };
}

/** トークン発行と performances.json の応答を返す偽の fetch */
function fakeFetch({
  token = json({ token: TOKEN, expires_in: 600 }),
  report = json([]) as Response,
} = {}) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.href === TOKEN_URL) return token;
    if (url.pathname === REPORT_PATH) return report;
    throw new Error(`想定外の URL: ${url.pathname}`);
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchAdGenerationDaily", () => {
  it("メールアドレスとパスワードでトークンを発行し、円・全種類・広告枠別でレポートを取る", async () => {
    const fetchImpl = fakeFetch();

    await fetchAdGenerationDaily(RANGE, ENV, fetchImpl);

    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[0];
    expect(String(tokenUrl)).toBe(TOKEN_URL);
    expect(tokenInit?.method).toBe("POST");
    expect(JSON.parse(String(tokenInit?.body))).toEqual({
      email: ENV.ADGENERATION_EMAIL,
      password: ENV.ADGENERATION_PASSWORD,
    });

    const reportUrl = new URL(String(fetchImpl.mock.calls[1][0]));
    expect(reportUrl.origin).toBe("https://ad-generation.jp");
    expect(reportUrl.searchParams.get("token")).toBe(TOKEN);
    expect(reportUrl.searchParams.get("currency")).toBe("JPY");
    expect(reportUrl.searchParams.get("begin_date")).toBe(RANGE.from);
    expect(reportUrl.searchParams.get("end_date")).toBe(RANGE.to);
    expect(reportUrl.searchParams.getAll("kind[]")).toEqual([
      "adnw",
      "rtb",
      "additional_adnw",
      "house_ad",
      "pure_ad",
    ]);
    expect(reportUrl.searchParams.getAll("dimensions[]")).toEqual([
      "ad_placement",
    ]);
  });

  it("広告枠×日の行にして、収益・表示回数・クリック数を入れる", async () => {
    const fetchImpl = fakeFetch({
      report: json([
        perf(),
        perf({
          placementId: 172_002,
          placementName: "はぴけん Android",
          revenue: 0,
          impression: 2,
          click: 0,
        }),
      ]),
    });

    const rows = await fetchAdGenerationDaily(RANGE, ENV, fetchImpl);

    expect(rows).toEqual([
      {
        date: "2026-09-20",
        key: "172001",
        label: "はぴけん iOS",
        metrics: { revenue: 0.42, impressions: 3, clicks: 1 },
      },
      {
        date: "2026-09-20",
        key: "172002",
        label: "はぴけん Android",
        metrics: { revenue: 0, impressions: 2, clicks: 0 },
      },
    ]);
  });

  // 集計対象（kind）ごとに行が分かれて返っても、同じ日・同じ広告枠は1行にまとめる（同期は重複行を受け付けない）
  it("同じ日・同じ広告枠の行は足し合わせて1行にする", async () => {
    const fetchImpl = fakeFetch({
      report: json([
        perf({ revenue: 0.5, impression: 3, click: 1 }),
        perf({ revenue: 0.25, impression: 2, click: null }),
        perf({ date: "2026-09-21", revenue: null, impression: 1, click: 0 }),
      ]),
    });

    const rows = await fetchAdGenerationDaily(RANGE, ENV, fetchImpl);

    expect(rows).toEqual([
      {
        date: "2026-09-20",
        key: "172001",
        label: "はぴけん iOS",
        metrics: { revenue: 0.75, impressions: 5, clicks: 1 },
      },
      {
        date: "2026-09-21",
        key: "172001",
        label: "はぴけん iOS",
        metrics: { revenue: 0, impressions: 1, clicks: 0 },
      },
    ]);
  });

  it("期間中に配信が無ければ空で返す", async () => {
    const rows = await fetchAdGenerationDaily(RANGE, ENV, fakeFetch());
    expect(rows).toEqual([]);
  });

  it("ログインに失敗したら、レポートを取りに行かずに理由を知らせる", async () => {
    const fetchImpl = fakeFetch({
      token: json({ message: "Invalid email or password." }, 401),
    });

    await expect(fetchAdGenerationDaily(RANGE, ENV, fetchImpl)).rejects.toThrow(
      new AdSourceError(
        "AdGeneration にログインできません（メールアドレス・パスワードが違うか、アカウントがロックされています）",
      ),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("トークンが返ってこなければ失敗にする", async () => {
    const fetchImpl = fakeFetch({ token: json({ expires_in: 600 }) });

    await expect(fetchAdGenerationDaily(RANGE, ENV, fetchImpl)).rejects.toThrow(
      AdSourceError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("レポートの取得に失敗したら HTTP の番号を知らせ、ログにトークンもパスワードも残さない", async () => {
    const fetchImpl = fakeFetch({
      report: json({ message: "The access token expired" }, 401),
    });

    await expect(fetchAdGenerationDaily(RANGE, ENV, fetchImpl)).rejects.toThrow(
      new AdSourceError(
        "AdGeneration のレポート取得に失敗しました（HTTP 401）",
      ),
    );
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("The access token expired");
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(ENV.ADGENERATION_PASSWORD);
  });

  it("応答が配列でなければ失敗にする", async () => {
    const fetchImpl = fakeFetch({ report: json({ data: [] }) });

    await expect(fetchAdGenerationDaily(RANGE, ENV, fetchImpl)).rejects.toThrow(
      new AdSourceError("AdGeneration のレポートの形が想定と違います"),
    );
  });

  it("日付か広告枠IDが欠けた行があれば失敗にする", async () => {
    const noPlacement = { ...perf(), ad_placement_id: undefined };
    const fetchImpl = fakeFetch({ report: json([perf(), noPlacement]) });

    await expect(fetchAdGenerationDaily(RANGE, ENV, fetchImpl)).rejects.toThrow(
      new AdSourceError("AdGeneration のレポートの形が想定と違います"),
    );
  });

  it("円以外の通貨の行があれば取り込まずに止める", async () => {
    const fetchImpl = fakeFetch({
      report: json([perf({ currency: "USD" })]),
    });

    await expect(fetchAdGenerationDaily(RANGE, ENV, fetchImpl)).rejects.toThrow(
      new AdSourceError(
        "AdGeneration の収益が円ではありません（USD）。取り込みを止めています",
      ),
    );
  });
});
