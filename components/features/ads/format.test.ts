import { describe, expect, it } from "vitest";
import { emptyTotals, type AdSourceOverview } from "@/lib/ad-sources/overview";
import type { AdSourceId } from "@/lib/ad-sources/types";
import {
  formatDayWithWeekday,
  formatSyncedAt,
  lastSyncLabel,
  formatYenPerUser,
  kpiNote,
  sourceState,
  sourceSummary,
  summarizeImport,
  summarizeSync,
} from "./format";

const LABELS = new Map<AdSourceId, string>([
  ["tenjin", "Tenjin"],
  ["smaad_spend", "SmaAD（広告出稿）"],
  ["admob", "Google AdMob"],
  ["smaad", "SmaAD"],
]);

function source(patch: Partial<AdSourceOverview>): AdSourceOverview {
  return {
    id: "tenjin",
    label: "Tenjin",
    provides: "インストール数",
    configured: false,
    totals: emptyTotals(),
    latestRun: null,
    lastSuccessAt: null,
    pendingMetrics: [],
    csvImport: false,
    ...patch,
  };
}

const RUN = {
  trigger: "cron" as const,
  rowCount: 7,
  message: null,
  finishedAt: "2026-09-23T02:05:00.000Z",
};

describe("formatYenPerUser", () => {
  it("1人あたりの金額は小さくなるので、小数第1位まで出す", () => {
    expect(formatYenPerUser(1833.333)).toBe("￥1,833.3");
    expect(formatYenPerUser(0.44)).toBe("￥0.4");
    expect(formatYenPerUser(250)).toBe("￥250.0");
  });

  it("値が無ければ — にする", () => {
    expect(formatYenPerUser(null)).toBe("—");
  });
});

describe("kpiNote", () => {
  it("未接続の媒体があって値が出せなければ、媒体名を並べる", () => {
    expect(
      kpiNote({ value: null, missing: ["admob", "smaad"] }, LABELS, "x"),
    ).toEqual({ warning: true, text: "未接続: Google AdMob・SmaAD" });
  });

  it("合計が一部の媒体だけのときは、そうとわかるように書く", () => {
    expect(kpiNote({ value: 100, missing: ["smaad"] }, LABELS, "x")).toEqual({
      warning: true,
      text: "一部のみ（未接続: SmaAD）",
    });
  });

  it("全部つながっていて値が出せないのは、分母が0のとき", () => {
    expect(kpiNote({ value: null, missing: [] }, LABELS, "x")).toEqual({
      warning: true,
      text: "分母が0のため計算できません",
    });
  });

  it("問題なければ計算式を出す", () => {
    expect(
      kpiNote({ value: 250, missing: [] }, LABELS, "広告費 ÷ インストール数"),
    ).toEqual({ warning: false, text: "広告費 ÷ インストール数" });
  });
});

describe("sourceState", () => {
  it("認証情報が無く、同期もしていなければ「未接続」", () => {
    expect(sourceState(source({}))).toEqual({
      kind: "not-configured",
      label: "未接続",
      detail: "認証情報が未設定です",
    });
  });

  it("認証情報はあるがまだ同期していなければ「同期待ち」", () => {
    expect(sourceState(source({ configured: true })).kind).toBe("never-synced");
  });

  it("CSV を画面から取り込む媒体で、まだ取り込んでいなければ「取り込み待ち」", () => {
    expect(
      sourceState(source({ id: "smaad", configured: true, csvImport: true })),
    ).toEqual({
      kind: "never-synced",
      label: "取り込み待ち",
      detail: "管理画面の CSV をまだ取り込んでいません",
    });
  });

  it("最新の同期の結果をそのまま出す", () => {
    expect(
      sourceState(source({ latestRun: { ...RUN, status: "success" } })),
    ).toEqual({ kind: "ok", label: "正常", detail: null });
    expect(
      sourceState(
        source({
          latestRun: { ...RUN, status: "failed", message: "キーが無効です" },
        }),
      ),
    ).toEqual({ kind: "failed", label: "失敗", detail: "キーが無効です" });
    expect(
      sourceState(
        source({
          latestRun: {
            ...RUN,
            status: "skipped",
            message: "取得処理がまだ実装されていません",
          },
        }),
      ),
    ).toEqual({
      kind: "skipped",
      label: "未取得",
      detail: "取得処理がまだ実装されていません",
    });
  });
});

describe("sourceSummary", () => {
  it("一度も取り込めていなければ null（画面では「—」）", () => {
    expect(sourceSummary(source({}))).toBe(null);
  });

  it("媒体の種類ごとに、いちばん見たい数字を大きく出せる形にする", () => {
    const at = "2026-09-23T02:05:00.000Z";
    expect(
      sourceSummary(
        source({
          lastSuccessAt: at,
          totals: { ...emptyTotals(), spend: 999, installs: 67 },
        }),
      ),
    ).toEqual({ label: "インストール", value: "67件", sub: null });
    expect(
      sourceSummary(
        source({
          id: "smaad_spend",
          lastSuccessAt: at,
          totals: {
            ...emptyTotals(),
            spend: 12_345,
            conversions: 89,
            installs: 5,
          },
        }),
      ),
    ).toEqual({ label: "広告費", value: "￥12,345", sub: "成果 89件" });
    expect(
      sourceSummary(
        source({
          id: "admob",
          lastSuccessAt: at,
          totals: { ...emptyTotals(), revenue: 8_000.4 },
        }),
      ),
    ).toEqual({ label: "収益", value: "￥8,000", sub: null });
    expect(
      sourceSummary(
        source({
          id: "appstore",
          lastSuccessAt: at,
          totals: { ...emptyTotals(), proceeds: 7_000, grossSales: 10_000 },
        }),
      ),
    ).toEqual({ label: "手取り", value: "￥7,000", sub: "売上 ￥10,000" });
  });

  it("広告費をまだ取り込んでいなければ、広告費を ￥0 と出さずに準備中と書く", () => {
    expect(
      sourceSummary(
        source({
          id: "smaad_spend",
          lastSuccessAt: "2026-09-23T02:05:00.000Z",
          pendingMetrics: ["spend"],
          totals: { ...emptyTotals(), conversions: 89 },
        }),
      ),
    ).toEqual({ label: "成果", value: "89件", sub: "広告費は取り込み準備中" });
  });

  it("収益をまだ取り込んでいなければ、収益を ￥0 と出さずに表示回数とクリック数を出す", () => {
    expect(
      sourceSummary(
        source({
          id: "admob",
          lastSuccessAt: "2026-09-23T02:05:00.000Z",
          pendingMetrics: ["revenue"],
          totals: { ...emptyTotals(), impressions: 4_790, clicks: 24 },
        }),
      ),
    ).toEqual({
      label: "表示",
      value: "4,790回",
      sub: "クリック 24件・収益は取り込み準備中",
    });
  });

  it("手取りをまだ取り込んでいなければ、手取りを ￥0 と出さずに売上だけ出す", () => {
    expect(
      sourceSummary(
        source({
          id: "googleplay",
          lastSuccessAt: "2026-09-25T02:05:00.000Z",
          pendingMetrics: ["proceeds"],
          totals: { ...emptyTotals(), grossSales: 470 },
        }),
      ),
    ).toEqual({ label: "売上", value: "￥470", sub: "手取りは取り込み準備中" });
  });
});

describe("lastSyncLabel", () => {
  it("最後に取り込んだ日時と、取り込み方（自動・手動・CSV）を出す", () => {
    const at = (trigger: "cron" | "manual" | "csv") =>
      lastSyncLabel(
        source({ latestRun: { ...RUN, trigger, status: "success" } }),
      );
    expect(at("cron")).toBe("9月23日 11:05（自動）");
    expect(at("manual")).toBe("9月23日 11:05（手動）");
    expect(at("csv")).toBe("9月23日 11:05（CSV）");
  });

  it("まだ一度も取り込んでいなければ —", () => {
    expect(lastSyncLabel(source({}))).toBe("—");
  });
});

describe("formatSyncedAt", () => {
  it("日本時間の月日と時刻にする", () => {
    expect(formatSyncedAt("2026-09-23T02:05:00.000Z")).toBe("9月23日 11:05");
    expect(formatSyncedAt("2026-09-22T15:00:00.000Z")).toBe("9月23日 0:00");
  });
});

describe("summarizeSync", () => {
  it("成功・失敗・未取得の件数をまとめる", () => {
    expect(
      summarizeSync([
        { status: "success" },
        { status: "failed" },
        { status: "skipped" },
        { status: "skipped" },
      ]),
    ).toBe("同期しました（成功 1・失敗 1・未取得 2）");
  });
});

describe("summarizeImport", () => {
  it("取り込んだ期間と行数を伝える", () => {
    expect(
      summarizeImport({
        label: "SmaAD",
        range: { from: "2026-09-01", to: "2026-09-25" },
        rowCount: 25,
      }),
    ).toBe("SmaAD: 9月1日〜9月25日の25行を取り込みました");
  });

  it("1日分だけなら期間を1日で書く", () => {
    expect(
      summarizeImport({
        label: "SmaAD",
        range: { from: "2026-10-01", to: "2026-10-01" },
        rowCount: 1,
      }),
    ).toBe("SmaAD: 10月1日の1行を取り込みました");
  });
});

describe("formatDayWithWeekday", () => {
  it("日付キーを「月/日（曜日）」にする（閲覧者の端末の時刻設定に左右されない）", () => {
    expect(formatDayWithWeekday("2026-09-22")).toBe("9/22（火）");
    expect(formatDayWithWeekday("2026-09-27")).toBe("9/27（日）");
    expect(formatDayWithWeekday("2026-10-03")).toBe("10/3（土）");
  });
});
