import { describe, expect, it } from "vitest";
import {
  addDays,
  isDayKey,
  jstDayKey,
  jstDayStart,
  listDayKeys,
  spanDays,
} from "./jst-date";

describe("jstDayStart", () => {
  it("JST の 0 時を UTC の前日 15 時として返す（care の getJSTDayRange と同じ境界）", () => {
    expect(jstDayStart("2026-09-23").toISOString()).toBe(
      "2026-09-22T15:00:00.000Z",
    );
  });

  it("月初・年初でも前日にまたがって正しく返す", () => {
    expect(jstDayStart("2026-01-01").toISOString()).toBe(
      "2025-12-31T15:00:00.000Z",
    );
  });
});

describe("jstDayKey", () => {
  it("UTC の 14:59 は JST ではまだ同じ日", () => {
    expect(jstDayKey(new Date("2026-09-22T14:59:59.999Z"))).toBe("2026-09-22");
  });

  it("UTC の 15:00 は JST では翌日", () => {
    expect(jstDayKey(new Date("2026-09-22T15:00:00.000Z"))).toBe("2026-09-23");
  });

  it("jstDayStart と往復して同じ日付に戻る", () => {
    expect(jstDayKey(jstDayStart("2026-03-01"))).toBe("2026-03-01");
  });
});

describe("addDays", () => {
  it("月末をまたいで足し引きできる", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-09-23", -29)).toBe("2026-08-25");
  });
});

describe("listDayKeys", () => {
  it("開始日と終了日を両端とも含めて並べる", () => {
    expect(listDayKeys("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("開始日が終了日より後なら空", () => {
    expect(listDayKeys("2026-09-02", "2026-09-01")).toEqual([]);
  });
});

describe("spanDays", () => {
  it("両端を含む日数を返す", () => {
    expect(spanDays("2026-09-01", "2026-09-30")).toBe(30);
    expect(spanDays("2026-09-23", "2026-09-23")).toBe(1);
  });
});

describe("isDayKey", () => {
  it("YYYY-MM-DD の実在する日付だけを受け付ける", () => {
    expect(isDayKey("2026-09-23")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-9-23")).toBe(false);
    expect(isDayKey("2026-09-23T00:00")).toBe(false);
    expect(isDayKey("")).toBe(false);
  });
});
