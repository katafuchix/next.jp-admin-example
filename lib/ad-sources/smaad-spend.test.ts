import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSmaadSpendDaily } from "./smaad-spend";
import { AdSourceError } from "./types";

const ENV = {
  SMAAD_ADVERTISER_API_KEY: "0123456789abcdef0123456789abcdef",
  SMAAD_ADVERTISER_ACCOUNT_ID: "999999999",
};
const RANGE = { from: "2026-09-16", to: "2026-09-23" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** reports の1行（group_by=date のとき）。形は SmaAD Report API for Advertiser の仕様書の Sample */
function report({
  date = "2026-09-20" as unknown,
  imp = 78 as unknown,
  click = 356 as unknown,
  cv = 22 as unknown,
  cost = 14_200.0 as unknown,
} = {}) {
  return { date, imp, click, cv, cost };
}

function fakeFetch(res: Response = json([])) {
  return vi.fn<typeof fetch>(async () => res);
}

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchSmaadSpendDaily", () => {
  it("広告主の API キーとアカウント ID で、円・日本時間・日付別のレポートを GET で取る", async () => {
    const fetchImpl = fakeFetch();

    await fetchSmaadSpendDaily(RANGE, ENV, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [input, init] = fetchImpl.mock.calls[0];
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe(
      "https://media.smaad.net/api/reports",
    );
    expect(init?.method ?? "GET").toBe("GET");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      key: ENV.SMAAD_ADVERTISER_API_KEY,
      account_id: ENV.SMAAD_ADVERTISER_ACCOUNT_ID,
      start_date: "2026-09-16",
      end_date: "2026-09-23",
      currency: "JPY",
      timezone: "9",
      group_by: "date",
      metrics: "imp,click,cv,cost",
      output_type: "json",
    });
  });

  it("指標の区切りのカンマは仕様書の例どおり、そのまま送る", async () => {
    const fetchImpl = fakeFetch();

    await fetchSmaadSpendDaily(RANGE, ENV, fetchImpl);

    const search = new URL(String(fetchImpl.mock.calls[0][0])).search;
    expect(search).toContain("metrics=imp,click,cv,cost");
  });

  it("1日1行、CSV の取り込みと同じキー（全キャンペーン）で広告費・表示回数・クリック数・成果件数にする", async () => {
    const fetchImpl = fakeFetch(
      json([
        report({
          date: "2026-09-20",
          imp: 78,
          click: 356,
          cv: 22,
          cost: 14_200,
        }),
        report({ date: "2026-09-21", imp: 0, click: 12, cv: 1, cost: 100.5 }),
      ]),
    );

    const rows = await fetchSmaadSpendDaily(RANGE, ENV, fetchImpl);

    expect(rows).toEqual([
      {
        date: "2026-09-20",
        key: "total",
        label: "全キャンペーン",
        metrics: {
          spend: 14_200,
          impressions: 78,
          clicks: 356,
          conversions: 22,
        },
      },
      {
        date: "2026-09-21",
        key: "total",
        label: "全キャンペーン",
        metrics: { spend: 100.5, impressions: 0, clicks: 12, conversions: 1 },
      },
    ]);
  });

  it("同じ日付の行が複数返ってきたら足し合わせる", async () => {
    const fetchImpl = fakeFetch(
      json([
        report({ date: "2026-09-20", imp: 10, click: 5, cv: 2, cost: 200 }),
        report({ date: "2026-09-20", imp: 1, click: 1, cv: 1, cost: 100 }),
      ]),
    );

    const rows = await fetchSmaadSpendDaily(RANGE, ENV, fetchImpl);

    expect(rows).toHaveLength(1);
    expect(rows[0].metrics).toEqual({
      spend: 300,
      impressions: 11,
      clicks: 6,
      conversions: 3,
    });
  });

  it("数値が文字列で返ってきても読む（仕様書の指標の例は文字列）", async () => {
    const fetchImpl = fakeFetch(
      json([report({ imp: "300", click: "100", cv: "4", cost: "20.3" })]),
    );

    const rows = await fetchSmaadSpendDaily(RANGE, ENV, fetchImpl);

    expect(rows[0].metrics).toEqual({
      spend: 20.3,
      impressions: 300,
      clicks: 100,
      conversions: 4,
    });
  });

  it("実績の無い期間は空で返す", async () => {
    await expect(
      fetchSmaadSpendDaily(RANGE, ENV, fakeFetch(json([]))),
    ).resolves.toEqual([]);
  });

  it.each([
    ["配列でない", { error: "invalid account" }],
    ["日付が無い", [report({ date: null })]],
    ["広告費が数値でない", [report({ cost: "abc" })]],
    ["広告費が無い", [report({ cost: null })]],
    ["成果件数が数値でない", [report({ cv: {} })]],
  ])("応答の形が違う（%s）なら止める", async (_, body) => {
    const err = await fetchSmaadSpendDaily(
      RANGE,
      ENV,
      fakeFetch(json(body)),
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect((err as Error).message).toContain("形が想定と違います");
  });

  it.each([401, 403])(
    "HTTP %i は、キーかアカウント ID の誤りとして伝える",
    async (status) => {
      const err = await fetchSmaadSpendDaily(
        RANGE,
        ENV,
        fakeFetch(new Response("unauthorized", { status })),
      ).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AdSourceError);
      expect((err as Error).message).toContain("API キーかアカウント ID");
    },
  );

  it("そのほかの失敗は HTTP の番号を伝え、ログにはキーも URL も残さない", async () => {
    const err = await fetchSmaadSpendDaily(
      RANGE,
      ENV,
      fakeFetch(new Response("maintenance", { status: 503 })),
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect((err as Error).message).toContain("HTTP 503");
    expect(errorLog).toHaveBeenCalled();
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain("maintenance");
    expect(logged).not.toContain(ENV.SMAAD_ADVERTISER_API_KEY);
    expect(logged).not.toContain("media.smaad.net");
    expect((err as Error).message).not.toContain(ENV.SMAAD_ADVERTISER_API_KEY);
  });
});
