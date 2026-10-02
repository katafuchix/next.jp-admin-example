import type { MonthlyRevenue } from "@/lib/revenue-monthly";

/** 画面テスト用の API 応答。SmaAD（広告出稿）と AdMob だけつながっている想定 */
export function buildPartialRevenue(year = "2026"): MonthlyRevenue {
  return {
    year,
    rows: [
      {
        yearMonth: `${year}-08`,
        chargeRevenue: null,
        adRevenue: 3_000,
        total: 3_000,
        cost: 40_000,
        profit: null,
      },
      {
        yearMonth: `${year}-09`,
        chargeRevenue: null,
        adRevenue: 5_000,
        total: 5_000,
        cost: 20_000,
        profit: null,
      },
    ],
    totals: {
      chargeRevenue: null,
      adRevenue: 8_000,
      total: 8_000,
      cost: 60_000,
      profit: null,
    },
    missing: {
      charge: [
        { id: "appstore", label: "App Store Connect" },
        { id: "googleplay", label: "Google Play Console" },
      ],
      ad: [
        { id: "adgeneration", label: "AdGeneration" },
        { id: "smaad", label: "SmaAD" },
      ],
      cost: [],
    },
  };
}

/** 7媒体すべてつながっている想定 */
export function buildCompleteRevenue(year = "2026"): MonthlyRevenue {
  return {
    year,
    rows: [
      {
        yearMonth: `${year}-09`,
        chargeRevenue: 40_000,
        adRevenue: 10_000,
        total: 50_000,
        cost: 20_000,
        profit: 30_000,
      },
    ],
    totals: {
      chargeRevenue: 40_000,
      adRevenue: 10_000,
      total: 50_000,
      cost: 20_000,
      profit: 30_000,
    },
    missing: { charge: [], ad: [], cost: [] },
  };
}
