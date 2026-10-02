import { describe, expect, it } from "vitest";
import { resolveDayRange } from "./day-range";

const BASE = { today: "2026-09-23", defaultSpanDays: 7, maxSpanDays: 31 };

describe("resolveDayRange", () => {
  it("省略時は昨日までの既定日数", () => {
    expect(resolveDayRange(BASE)).toEqual({
      ok: true,
      range: { from: "2026-09-16", to: "2026-09-22" },
    });
  });

  it("終了日だけ指定されたら、そこから既定日数さかのぼる", () => {
    expect(resolveDayRange({ ...BASE, to: "2026-09-10" })).toEqual({
      ok: true,
      range: { from: "2026-09-04", to: "2026-09-10" },
    });
  });

  it.each([
    [{ from: "2026-9-1" }, "期間は YYYY-MM-DD の形式で指定してください"],
    [{ from: "2026-02-30" }, "期間は YYYY-MM-DD の形式で指定してください"],
    [
      { from: "2026-09-20", to: "2026-09-10" },
      "開始日は終了日以前にしてください",
    ],
    [
      { from: "2026-08-01", to: "2026-09-10" },
      "期間は31日以内で指定してください",
    ],
  ])("不正な指定 %o は理由を返す", (input, error) => {
    expect(resolveDayRange({ ...BASE, ...input })).toEqual({
      ok: false,
      error,
    });
  });

  it("allowFuture: false なら今日より後の終了日を弾く", () => {
    expect(
      resolveDayRange({
        ...BASE,
        from: "2026-09-20",
        to: "2026-09-24",
        allowFuture: false,
      }),
    ).toEqual({ ok: false, error: "終了日は今日以前にしてください" });
    expect(
      resolveDayRange({
        ...BASE,
        from: "2026-09-20",
        to: "2026-09-23",
        allowFuture: false,
      }).ok,
    ).toBe(true);
  });
});
