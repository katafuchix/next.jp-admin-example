import { describe, expect, it } from "vitest";
import {
  formatDayLabel,
  formatPercent,
  presetRange,
  validateRange,
} from "./format";

describe("formatPercent", () => {
  it("割合を小数1桁のパーセントにする", () => {
    expect(formatPercent(0.4)).toBe("40.0%");
    expect(formatPercent(30 / 1234)).toBe("2.4%");
  });

  it("分母が無い（null）ときは — を返す", () => {
    expect(formatPercent(null)).toBe("—");
  });
});

describe("formatDayLabel", () => {
  it("YYYY-MM-DD を「M月D日」にする", () => {
    expect(formatDayLabel("2026-09-03")).toBe("9月3日");
  });
});

describe("presetRange", () => {
  it("昨日（JST）までの N 日間を返す", () => {
    // JST 2026-09-23 10:00
    const now = new Date("2026-09-23T01:00:00Z");
    expect(presetRange(7, now)).toEqual({
      from: "2026-09-16",
      to: "2026-09-22",
    });
    expect(presetRange(30, now)).toEqual({
      from: "2026-08-24",
      to: "2026-09-22",
    });
  });
});

describe("validateRange", () => {
  it("正しい期間なら null", () => {
    expect(validateRange("2026-09-01", "2026-09-01")).toBeNull();
  });

  it.each([
    ["", "2026-09-10", "開始日と終了日を入力してください"],
    ["2026-09-10", "2026-09-01", "開始日は終了日以前にしてください"],
    ["2025-01-01", "2026-09-01", "期間は366日以内で指定してください"],
  ])("%s〜%s は「%s」", (from, to, message) => {
    expect(validateRange(from, to)).toBe(message);
  });
});
