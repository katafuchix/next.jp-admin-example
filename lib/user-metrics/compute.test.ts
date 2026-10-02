import { describe, expect, it } from "vitest";
import {
  buildSignupHeatmap,
  computeRetention,
  fillDailySeries,
  ratio,
  WEEKDAY_LABELS,
} from "./compute";

describe("ratio", () => {
  it("分母が0なら null（0% と「データなし」を区別する）", () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(1, 4)).toBe(0.25);
  });
});

describe("fillDailySeries", () => {
  it("記録の無い日を 0 で埋め、期間外の行は捨てる", () => {
    const series = fillDailySeries("2026-09-01", "2026-09-03", [
      { day: "2026-09-03", count: 5 },
      { day: "2026-09-01", count: 2 },
      { day: "2026-08-31", count: 99 },
    ]);
    expect(series).toEqual([
      { day: "2026-09-01", count: 2 },
      { day: "2026-09-02", count: 0 },
      { day: "2026-09-03", count: 5 },
    ]);
  });
});

describe("computeRetention", () => {
  const cohort = [
    { userId: "a", signupDay: "2026-09-01" },
    { userId: "b", signupDay: "2026-09-01" },
    { userId: "c", signupDay: "2026-09-10" },
  ];

  it("登録からちょうど N 日目にアクティブだった割合を出す", () => {
    const activity = [
      { userId: "a", day: "2026-09-02" }, // a: D1
      { userId: "a", day: "2026-09-08" }, // a: D7
      { userId: "b", day: "2026-09-03" }, // b: D2（どれにも数えない）
      { userId: "c", day: "2026-09-11" }, // c: D1
    ];
    // 今日 = 10-05。c の D30（10-10）はまだ来ていないので D30 の分母は a/b の2人
    const result = computeRetention(cohort, activity, "2026-10-05");
    expect(result).toEqual([
      { day: 1, eligible: 3, retained: 2, rate: 2 / 3 },
      { day: 7, eligible: 3, retained: 1, rate: 1 / 3 },
      { day: 30, eligible: 2, retained: 0, rate: 0 },
    ]);
  });

  it("N 日目がまだ終わっていないユーザーは分母から外す（当日は途中なので数えない）", () => {
    // 今日 = 09-11。c の D1（09-11）は今日なので外れ、a/b の D7（09-08）は終わっている
    const result = computeRetention(cohort, [], "2026-09-11");
    expect(result.find((r) => r.day === 1)?.eligible).toBe(2);
    expect(result.find((r) => r.day === 7)?.eligible).toBe(2);
    expect(result.find((r) => r.day === 30)).toEqual({
      day: 30,
      eligible: 0,
      retained: 0,
      rate: null,
    });
  });

  it("同じ日に重複した行があっても1人として数える", () => {
    const result = computeRetention(
      [{ userId: "a", signupDay: "2026-09-01" }],
      [
        { userId: "a", day: "2026-09-02" },
        { userId: "a", day: "2026-09-02" },
      ],
      "2026-10-20",
    );
    expect(result[0]).toEqual({ day: 1, eligible: 1, retained: 1, rate: 1 });
  });
});

describe("buildSignupHeatmap", () => {
  it("登録日時を JST の曜日（月〜日）×時（0〜23）に振り分ける", () => {
    const heatmap = buildSignupHeatmap([
      new Date("2026-09-20T15:30:00Z"), // JST 09-21（月）0時台
      new Date("2026-09-21T14:59:00Z"), // JST 09-21（月）23時台
      new Date("2026-09-27T01:00:00Z"), // JST 09-27（日）10時台
      new Date("2026-09-27T01:59:00Z"), // JST 09-27（日）10時台
    ]);
    expect(WEEKDAY_LABELS).toEqual(["月", "火", "水", "木", "金", "土", "日"]);
    expect(heatmap).toHaveLength(7);
    expect(heatmap.every((row) => row.length === 24)).toBe(true);
    expect(heatmap[0][0]).toBe(1);
    expect(heatmap[0][23]).toBe(1);
    expect(heatmap[6][10]).toBe(2);
    expect(heatmap.flat().reduce((s, n) => s + n, 0)).toBe(4);
  });
});
