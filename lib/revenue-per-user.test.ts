import { describe, expect, it } from "vitest";
import type { Kpi } from "@/lib/ad-sources/overview";
import { buildRevenuePerUser } from "./revenue-per-user";

const connected = (value: number): Kpi => ({ value, missing: [] });

const ACTIVITY = { activeUsers: 200, totalLogins: 1_000 };

describe("buildRevenuePerUser", () => {
  it("ARPU は収益合計 ÷ 期間の利用者、ARPPU は課金の手取り ÷ 課金ユーザー、ARPDAU は収益合計 ÷ 延べ利用者", () => {
    const result = buildRevenuePerUser({
      totalRevenue: connected(50_000),
      salesProceeds: connected(30_000),
      activity: ACTIVITY,
      paidUsers: 40,
    });

    expect(result.arpu).toEqual({ value: 250, missing: [] });
    expect(result.arppu).toEqual({ value: 750, missing: [] });
    expect(result.arpdau).toEqual({ value: 50, missing: [] });
  });

  it("収益の媒体が1つでも未接続なら値を出さず、足りない媒体を返す", () => {
    const result = buildRevenuePerUser({
      totalRevenue: { value: 10_000, missing: ["smaad", "appstore"] },
      salesProceeds: { value: null, missing: ["appstore", "googleplay"] },
      activity: ACTIVITY,
      paidUsers: 40,
    });

    expect(result.arpu).toEqual({
      value: null,
      missing: ["smaad", "appstore"],
    });
    expect(result.arppu).toEqual({
      value: null,
      missing: ["appstore", "googleplay"],
    });
    expect(result.arpdau).toEqual({
      value: null,
      missing: ["smaad", "appstore"],
    });
  });

  it("利用者や課金ユーザーが0人なら 0 で割らずに値なしにする", () => {
    const result = buildRevenuePerUser({
      totalRevenue: connected(50_000),
      salesProceeds: connected(30_000),
      activity: { activeUsers: 0, totalLogins: 0 },
      paidUsers: 0,
    });

    expect(result.arpu).toEqual({ value: null, missing: [] });
    expect(result.arppu).toEqual({ value: null, missing: [] });
    expect(result.arpdau).toEqual({ value: null, missing: [] });
  });
});
