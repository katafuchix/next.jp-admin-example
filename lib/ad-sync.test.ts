import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  importAdRows,
  runAdSync,
  type AdSyncRunRecord,
  type AdSyncStore,
} from "./ad-sync";
import {
  AdSourceError,
  type AdDailyRow,
  type AdSource,
  type DayRange,
} from "./ad-sources/types";

const RANGE: DayRange = { from: "2026-09-16", to: "2026-09-22" };
const T0 = new Date("2026-09-23T02:00:00Z");

/** 保存・削除・履歴の呼び出しを記録する偽の保存先 */
function fakeStore({ failOn }: { failOn?: keyof AdSyncStore } = {}) {
  const upserts: { source: string; rows: AdDailyRow[]; fetchedAt: Date }[] = [];
  const removals: { source: string; range: DayRange; fetchedAt: Date }[] = [];
  const runs: AdSyncRunRecord[] = [];
  const fail = (op: keyof AdSyncStore) =>
    failOn === op ? Promise.reject(new Error(`${op} failed`)) : undefined;
  const store: AdSyncStore = {
    upsertDaily: async (source, rows, fetchedAt) => {
      await fail("upsertDaily");
      upserts.push({ source, rows, fetchedAt });
    },
    removeStale: async (source, range, fetchedAt) => {
      await fail("removeStale");
      removals.push({ source, range, fetchedAt });
      return 0;
    },
    recordRun: async (run) => {
      await fail("recordRun");
      runs.push(run);
    },
  };
  return { store, upserts, removals, runs };
}

function source(overrides: Partial<AdSource> = {}): AdSource {
  return {
    id: "tenjin",
    label: "Tenjin",
    provides: "広告費・インストール数",
    requiredEnv: ["TENJIN_API_KEY"],
    ...overrides,
  };
}

const ROWS: AdDailyRow[] = [
  {
    date: "2026-09-21",
    key: "cmp_1",
    label: "春キャンペーン",
    metrics: { spend: 1200, installs: 10 },
  },
  { date: "2026-09-22", key: "cmp_1", metrics: { spend: 800, installs: 5 } },
];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runAdSync", () => {
  it("認証情報が無い媒体は取得せず、足りない環境変数の名前つきで「スキップ」を記録する", async () => {
    const fetchDaily = vi.fn();
    const { store, upserts, runs } = fakeStore();

    const results = await runAdSync({
      sources: [source({ fetchDaily })],
      range: RANGE,
      trigger: "cron",
      env: { TENJIN_API_KEY: "  " },
      store,
      now: () => T0,
    });

    expect(fetchDaily).not.toHaveBeenCalled();
    expect(upserts).toEqual([]);
    expect(results).toEqual([
      {
        source: "tenjin",
        label: "Tenjin",
        status: "skipped",
        rowCount: 0,
        message: "認証情報が未設定です（TENJIN_API_KEY）",
      },
    ]);
    expect(runs).toEqual([
      {
        source: "tenjin",
        trigger: "cron",
        status: "skipped",
        from: RANGE.from,
        to: RANGE.to,
        rowCount: 0,
        message: "認証情報が未設定です（TENJIN_API_KEY）",
        startedAt: T0,
        finishedAt: T0,
      },
    ]);
  });

  it("認証情報はあっても取得処理が無い媒体は「スキップ」にする", async () => {
    const { store, runs } = fakeStore();

    const [result] = await runAdSync({
      sources: [source()],
      range: RANGE,
      trigger: "manual",
      env: { TENJIN_API_KEY: "key" },
      store,
      now: () => T0,
    });

    expect(result.status).toBe("skipped");
    expect(result.message).toBe("取得処理がまだ実装されていません");
    expect(runs[0].trigger).toBe("manual");
  });

  it("取得できたら行を保存し、同じ期間の古い行を片付けて「成功」を記録する", async () => {
    const fetchDaily = vi.fn().mockResolvedValue(ROWS);
    const { store, upserts, removals, runs } = fakeStore();
    const env = { TENJIN_API_KEY: "key" };

    const [result] = await runAdSync({
      sources: [source({ fetchDaily })],
      range: RANGE,
      trigger: "cron",
      env,
      store,
      now: () => T0,
    });

    expect(fetchDaily).toHaveBeenCalledWith(RANGE, env);
    expect(upserts).toEqual([{ source: "tenjin", rows: ROWS, fetchedAt: T0 }]);
    expect(removals).toEqual([
      { source: "tenjin", range: RANGE, fetchedAt: T0 },
    ]);
    expect(result).toEqual({
      source: "tenjin",
      label: "Tenjin",
      status: "success",
      rowCount: 2,
      message: null,
    });
    expect(runs[0]).toMatchObject({ status: "success", rowCount: 2 });
  });

  it("媒体が理由つきで失敗したら、その理由で「失敗」を記録し、保存も片付けもしない", async () => {
    const fetchDaily = vi
      .fn()
      .mockRejectedValue(new AdSourceError("API キーが無効です"));
    const { store, upserts, removals, runs } = fakeStore();

    const [result] = await runAdSync({
      sources: [source({ fetchDaily })],
      range: RANGE,
      trigger: "cron",
      env: { TENJIN_API_KEY: "key" },
      store,
      now: () => T0,
    });

    expect(result).toMatchObject({
      status: "failed",
      rowCount: 0,
      message: "API キーが無効です",
    });
    expect(upserts).toEqual([]);
    expect(removals).toEqual([]);
    expect(runs[0]).toMatchObject({
      status: "failed",
      message: "API キーが無効です",
    });
  });

  it("想定外の例外は中身を画面に出さず、ログにだけ残す", async () => {
    const fetchDaily = vi
      .fn()
      .mockRejectedValue(new Error("GET https://api?key=SECRET 500"));
    const { store, runs } = fakeStore();

    const [result] = await runAdSync({
      sources: [source({ fetchDaily })],
      range: RANGE,
      trigger: "cron",
      env: { TENJIN_API_KEY: "key" },
      store,
      now: () => T0,
    });

    expect(result.status).toBe("failed");
    expect(result.message).toBe(
      "取得に失敗しました（詳しい理由はサーバーのログにあります）",
    );
    expect(result.message).not.toContain("SECRET");
    expect(runs[0].message).not.toContain("SECRET");
    expect(console.error).toHaveBeenCalled();
  });

  it("保存に失敗したら「失敗」にし、古い行は片付けない", async () => {
    const fetchDaily = vi.fn().mockResolvedValue(ROWS);
    const { store, removals, runs } = fakeStore({ failOn: "upsertDaily" });

    const [result] = await runAdSync({
      sources: [source({ fetchDaily })],
      range: RANGE,
      trigger: "cron",
      env: { TENJIN_API_KEY: "key" },
      store,
      now: () => T0,
    });

    expect(result.status).toBe("failed");
    expect(removals).toEqual([]);
    expect(runs[0].status).toBe("failed");
  });

  it.each([
    [
      "期間の外の日付",
      [{ date: "2026-09-23", key: "a", metrics: {} }],
      "期間外の日付があります（1行目: 2026-09-23）",
    ],
    [
      "日付の形式違い",
      [{ date: "2026/09/22", key: "a", metrics: {} }],
      "日付の形式が違います（1行目: 2026/09/22）",
    ],
    [
      "空のキー",
      [{ date: "2026-09-22", key: " ", metrics: {} }],
      "キーが空です（1行目）",
    ],
    [
      "数値でない値",
      [{ date: "2026-09-22", key: "a", metrics: { spend: Number.NaN } }],
      "spend が数値ではありません（1行目）",
    ],
    [
      "同じ日付・キーの重複",
      [
        { date: "2026-09-22", key: "a", metrics: {} },
        { date: "2026-09-22", key: "a", metrics: {} },
      ],
      "同じ日付・キーの行が重複しています（2行目: 2026-09-22 / a）",
    ],
  ])(
    "取得結果に%sがあれば、1行も保存せず「失敗」にする",
    async (_, rows, message) => {
      const fetchDaily = vi.fn().mockResolvedValue(rows);
      const { store, upserts } = fakeStore();

      const [result] = await runAdSync({
        sources: [source({ fetchDaily })],
        range: RANGE,
        trigger: "cron",
        env: { TENJIN_API_KEY: "key" },
        store,
        now: () => T0,
      });

      expect(result).toMatchObject({ status: "failed", message });
      expect(upserts).toEqual([]);
    },
  );

  it("1つの媒体が失敗しても他の媒体は続けて取り込む", async () => {
    const { store, upserts } = fakeStore();

    const results = await runAdSync({
      sources: [
        source({ fetchDaily: vi.fn().mockRejectedValue(new Error("boom")) }),
        source({
          id: "admob",
          label: "Google AdMob",
          requiredEnv: [],
          fetchDaily: vi.fn().mockResolvedValue(ROWS),
        }),
      ],
      range: RANGE,
      trigger: "cron",
      env: { TENJIN_API_KEY: "key" },
      store,
      now: () => T0,
    });

    expect(results.map((r) => [r.source, r.status])).toEqual([
      ["tenjin", "failed"],
      ["admob", "success"],
    ]);
    expect(upserts.map((u) => u.source)).toEqual(["admob"]);
  });

  it("履歴の記録に失敗しても結果は返す", async () => {
    const { store } = fakeStore({ failOn: "recordRun" });

    const [result] = await runAdSync({
      sources: [source()],
      range: RANGE,
      trigger: "cron",
      env: {},
      store,
      now: () => T0,
    });

    expect(result.status).toBe("skipped");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("importAdRows（画面から渡された CSV の行）", () => {
  const smaad = source({
    id: "smaad",
    label: "SmaAD",
    provides: "オファーウォールの収益",
    requiredEnv: [],
  });
  const CSV_ROWS: AdDailyRow[] = [
    { date: "2026-09-03", key: "total", metrics: { revenue: 120, clicks: 4 } },
    { date: "2026-09-01", key: "total", metrics: { revenue: 50, clicks: 2 } },
    { date: "2026-09-02", key: "total", metrics: { revenue: 0, clicks: 0 } },
  ];

  it("行を保存し、行の日付の最初〜最後の期間で古い行を片付け、「CSV」の成功を記録する", async () => {
    const { store, upserts, removals, runs } = fakeStore();

    const result = await importAdRows({
      source: smaad,
      rows: CSV_ROWS,
      store,
      now: () => T0,
    });

    const range = { from: "2026-09-01", to: "2026-09-03" };
    expect(result).toEqual({
      source: "smaad",
      label: "SmaAD",
      range,
      rowCount: 3,
    });
    expect(upserts).toEqual([
      { source: "smaad", rows: CSV_ROWS, fetchedAt: T0 },
    ]);
    expect(removals).toEqual([{ source: "smaad", range, fetchedAt: T0 }]);
    expect(runs).toEqual([
      {
        source: "smaad",
        trigger: "csv",
        status: "success",
        from: "2026-09-01",
        to: "2026-09-03",
        rowCount: 3,
        message: null,
        startedAt: T0,
        finishedAt: T0,
      },
    ]);
  });

  it.each<[string, AdDailyRow[], string]>([
    ["行が無い", [], "取り込める行がありません"],
    [
      "日付の形が違う",
      [{ date: "2026/09/01", key: "total", metrics: { revenue: 1 } }],
      "日付の形式が違います",
    ],
    [
      "同じ日付・キーが2行ある",
      [
        { date: "2026-09-01", key: "total", metrics: { revenue: 1 } },
        { date: "2026-09-01", key: "total", metrics: { revenue: 2 } },
      ],
      "重複しています",
    ],
    [
      "数値でない指標がある",
      [{ date: "2026-09-01", key: "total", metrics: { revenue: Number.NaN } }],
      "revenue が数値ではありません",
    ],
  ])("%s ときは理由つきで止め、何も保存も記録もしない", async (_, rows, message) => {
    const { store, upserts, removals, runs } = fakeStore();

    const attempt = importAdRows({ source: smaad, rows, store, now: () => T0 });

    await expect(attempt).rejects.toThrow(AdSourceError);
    await expect(attempt).rejects.toThrow(message);
    expect(upserts).toEqual([]);
    expect(removals).toEqual([]);
    expect(runs).toEqual([]);
  });

  it("保存に失敗したら古い行を片付けず、成功も記録しない", async () => {
    const { store, removals, runs } = fakeStore({ failOn: "upsertDaily" });

    await expect(
      importAdRows({ source: smaad, rows: CSV_ROWS, store, now: () => T0 }),
    ).rejects.toThrow("upsertDaily failed");
    expect(removals).toEqual([]);
    expect(runs).toEqual([]);
  });

  // 履歴が無いと「未接続」のまま広告収益に数えられないので、記録の失敗は取り込みの失敗として返す
  it("履歴の記録に失敗したら、取り込みも失敗として返す", async () => {
    const { store } = fakeStore({ failOn: "recordRun" });

    await expect(
      importAdRows({ source: smaad, rows: CSV_ROWS, store, now: () => T0 }),
    ).rejects.toThrow("recordRun failed");
  });
});
