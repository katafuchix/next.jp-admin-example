import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchUsdJpyRates } from "./fx";
import { AdSourceError } from "./types";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Frankfurter の応答。既定値は 2026-09-10〜09-18 の実際のレート（09-12・13 は土日で行が無い） */
function ratesBody(
  rates: Record<string, number> = {
    "2026-09-10": 154.18,
    "2026-09-11": 154.04,
    "2026-09-14": 154.55,
    "2026-09-15": 155.0,
    "2026-09-16": 155.05,
    "2026-09-17": 155.69,
    "2026-09-18": 157.89,
  },
) {
  return {
    amount: 1.0,
    base: "USD",
    start_date: Object.keys(rates)[0],
    end_date: Object.keys(rates).at(-1),
    rates: Object.fromEntries(
      Object.entries(rates).map(([date, jpy]) => [date, { JPY: jpy }]),
    ),
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchUsdJpyRates", () => {
  it("その日のレートを返し、土日・祝日は前の営業日のレートを使う", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(ratesBody()));

    const rateOn = await fetchUsdJpyRates(
      { from: "2026-09-17", to: "2026-09-19" },
      fetchImpl,
    );

    expect(rateOn("2026-09-17")).toBe(155.69);
    expect(rateOn("2026-09-18")).toBe(157.89);
    // 09-19 は土曜
    expect(rateOn("2026-09-19")).toBe(157.89);
  });

  it("期間の初日が休みでも前の営業日を拾えるよう、7日前から頼む", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(ratesBody()));

    const rateOn = await fetchUsdJpyRates(
      { from: "2026-09-13", to: "2026-09-14" },
      fetchImpl,
    );

    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.origin).toBe("https://api.frankfurter.dev");
    expect(url.pathname).toBe("/v1/2026-09-06..2026-09-14");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      base: "USD",
      symbols: "JPY",
    });
    // 09-13 は日曜なので金曜 09-11 のレート
    expect(rateOn("2026-09-13")).toBe(154.04);
  });

  it("その日以前のレートが1つも無ければ、推測せずに失敗", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json(ratesBody({ "2026-09-18": 157.89 })),
    );

    const rateOn = await fetchUsdJpyRates(
      { from: "2026-09-17", to: "2026-09-18" },
      fetchImpl,
    );

    expect(() => rateOn("2026-09-17")).toThrow(AdSourceError);
    expect(() => rateOn("2026-09-17")).toThrow("2026-09-17");
  });

  it("取得に失敗したら、HTTP の状態を添えて失敗", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json({ message: "internal error" }, 500),
    );

    const err = await fetchUsdJpyRates(
      { from: "2026-09-17", to: "2026-09-18" },
      fetchImpl,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("為替");
    expect(err.message).toContain("HTTP 500");
  });

  it("レートが数値でなければ、形の違いとして失敗", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      json({ base: "USD", rates: { "2026-09-17": { JPY: "155.69" } } }),
    );

    const err = await fetchUsdJpyRates(
      { from: "2026-09-17", to: "2026-09-18" },
      fetchImpl,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AdSourceError);
    expect(err.message).toContain("形");
  });
});
