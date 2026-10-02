import type { UserMetrics } from "@/lib/user-metrics/query";

/** 画面テスト用の API 応答（昨日までの30日・JST 2026-09-23 に開いた想定） */
export function buildMetrics(): UserMetrics {
  const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  heatmap[0][9] = 3; // 月曜 9時台
  heatmap[6][21] = 5; // 日曜 21時台

  return {
    range: { from: "2026-08-24", to: "2026-09-22", today: "2026-09-23" },
    activity: {
      dau: [
        { day: "2026-08-24", count: 10 },
        { day: "2026-08-25", count: 14 },
      ],
      avgDau: 12.345,
      wau: 40,
      mau: 95,
      activeUsers: 120,
      totalLogins: 370,
    },
    retention: [
      { day: 1, eligible: 50, retained: 20, rate: 0.4 },
      { day: 7, eligible: 30, retained: 6, rate: 0.2 },
      { day: 30, eligible: 0, retained: 0, rate: null },
    ],
    users: {
      total: 1234,
      newUsers: 56,
      withdrawals: {
        total: 7,
        fromApp: 4,
        fromAdmin: 3,
        recordedSince: "2026-09-01",
      },
      signupHeatmap: heatmap,
    },
    paidRate: {
      overall: { paid: 30, total: 1234, rate: 30 / 1234 },
      cohort: { paid: 2, total: 56, rate: 2 / 56 },
    },
  };
}

export function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
