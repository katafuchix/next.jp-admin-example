import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyTotals } from "@/lib/ad-sources/overview";
import * as route from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectDB: vi.fn(),
  connectAppDB: vi.fn(),
  sumMonthlyBySource: vi.fn(),
  fetchSyncStatus: vi.fn(),
  userFind: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  connectDB: mocks.connectDB,
  connectAppDB: mocks.connectAppDB,
}));
vi.mock("@/models/AppUser", () => ({
  getAppUserModel: () => ({ find: mocks.userFind }),
}));
vi.mock("@/lib/ad-sources/store", () => ({
  sumMonthlyBySource: mocks.sumMonthlyBySource,
  fetchSyncStatus: mocks.fetchSyncStatus,
}));

function get(query: string) {
  return route.GET(
    new NextRequest(`http://localhost/admin/api/export${query}`),
  );
}

/** Excel が文字化けしないよう BOM 付きか確かめ、行ごとに分ける（text() は BOM を黙って外す） */
async function csvLines(res: Response) {
  const bytes = new Uint8Array(await res.arrayBuffer());
  expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  return new TextDecoder().decode(bytes).split("\r\n");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  // UTC では 2026-12-31 だが、JST ではもう 2027-01-01
  vi.useFakeTimers({ now: new Date("2026-12-31T16:00:00Z"), toFake: ["Date"] });
  mocks.auth.mockResolvedValue({ user: { id: "admin", role: "ANALYST" } });
  mocks.connectDB.mockResolvedValue(undefined);
  mocks.sumMonthlyBySource.mockResolvedValue([]);
  mocks.fetchSyncStatus.mockResolvedValue({
    latestRuns: new Map(),
    lastSuccess: new Map(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GET /api/export?type=revenue", () => {
  it("未ログインは 401", async () => {
    mocks.auth.mockResolvedValue(null);

    const res = await get("?type=revenue&year=2026");

    expect(res.status).toBe(401);
    expect(mocks.sumMonthlyBySource).not.toHaveBeenCalled();
  });

  it("エクスポートを許されていないロールは 403", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "s", role: "SUPPORT" } });

    const res = await get("?type=revenue&year=2026");

    expect(res.status).toBe(403);
    expect(mocks.sumMonthlyBySource).not.toHaveBeenCalled();
  });

  it("年が4桁の数字でなければ 400", async () => {
    const res = await get("?type=revenue&year=2026|.*");
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({
      success: false,
      error: "年は4桁の数字で指定してください",
    });
    expect(mocks.sumMonthlyBySource).not.toHaveBeenCalled();
  });

  it("年の指定が無ければ日本時間の今年", async () => {
    const res = await get("?type=revenue");

    expect(res.status).toBe(200);
    expect(mocks.sumMonthlyBySource).toHaveBeenCalledWith("2027");
  });

  it("画面と同じ月別集計を CSV にし、金額は画面と同じく円単位に丸め、取り込めていない欄は空にする", async () => {
    mocks.sumMonthlyBySource.mockResolvedValue([
      {
        yearMonth: "2026-09",
        source: "tenjin",
        totals: { ...emptyTotals(), installs: 200, rows: 22 },
      },
      {
        yearMonth: "2026-09",
        source: "adgeneration",
        totals: { ...emptyTotals(), revenue: 5_000, rows: 30 },
      },
      // AdMob（Tenjin 経由）の収益は円未満の端数つきで入ってくる
      {
        yearMonth: "2026-09",
        source: "admob",
        totals: {
          ...emptyTotals(),
          revenue: 9.5,
          impressions: 479,
          clicks: 5,
          rows: 2,
        },
      },
    ]);
    mocks.fetchSyncStatus.mockResolvedValue({
      latestRuns: new Map(),
      lastSuccess: new Map([
        ["tenjin", new Date("2026-09-23T02:00:00Z")],
        ["admob", new Date("2026-09-23T02:00:00Z")],
        ["adgeneration", new Date("2026-09-23T02:00:00Z")],
      ]),
    });

    const res = await get("?type=revenue&year=2026");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toContain(
      'filename="revenue-2026-',
    );
    expect(await csvLines(res)).toEqual([
      "年月,課金の手取り,広告収益,収益合計,広告費,粗利",
      "2026-09,,5010,5010,,",
      "合計,,5010,5010,,",
    ]);
  });

  it("データが無い年でも見本の数字を出さない", async () => {
    const res = await get("?type=revenue&year=2025");

    expect(await csvLines(res)).toEqual([
      "年月,課金の手取り,広告収益,収益合計,広告費,粗利",
    ]);
  });

  it("DB から取れなければ見本の数字にせず 500 を返す", async () => {
    mocks.connectDB.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const res = await get("?type=revenue&year=2026");
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({
      success: false,
      error: "収益データの取得に失敗しました",
    });
  });
});

/** Mongoose のクエリ（.sort().lean()）の代わり。上限（.limit）を掛けたら落ちるようにしておく */
function usersQuery(result: unknown) {
  const q = {
    sort: () => q,
    lean: () => Promise.resolve(result),
  };
  return q;
}

describe("GET /api/export?type=customers", () => {
  const APP_DB = { name: "app-db" };

  it("アプリの全ユーザーを CSV にする（件数の上限を掛けない）", async () => {
    mocks.connectAppDB.mockResolvedValue(APP_DB);
    const users = Array.from({ length: 10_001 }, (_, i) => ({
      _id: `u${i}`,
      email: `u${i}@example.com`,
      displayName: `利用者${i}`,
      isPaid: i === 0,
      createdAt: new Date("2026-05-01T03:00:00Z"),
      lastAppOpenAt: i === 0 ? new Date("2026-09-24T01:00:00Z") : undefined,
    }));
    mocks.userFind.mockReturnValue(usersQuery(users));

    const res = await get("?type=customers");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain(
      'filename="customers-',
    );
    const lines = await csvLines(res);
    expect(lines).toHaveLength(1 + 10_001);
    expect(lines[0]).toBe(
      "ユーザーID,メール,名前,ステータス,プラン,登録日,最終ログイン",
    );
    expect(lines[1]).toBe(
      "u0,u0@example.com,利用者0,offline,プレミアム,2026-05-01,2026-09-24",
    );
    expect(lines[2]).toBe("u1,u1@example.com,利用者1,offline,フリー,2026-05-01,");
  });

  it("ユーザーが0人なら見出しだけ（見本の行を出さない）", async () => {
    mocks.connectAppDB.mockResolvedValue(APP_DB);
    mocks.userFind.mockReturnValue(usersQuery([]));

    const res = await get("?type=customers");

    expect(await csvLines(res)).toEqual([
      "ユーザーID,メール,名前,ステータス,プラン,登録日,最終ログイン",
    ]);
  });

  it("アプリの DB が設定されていなければ見本の行にせず 500", async () => {
    mocks.connectAppDB.mockResolvedValue(null);

    const res = await get("?type=customers");

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      error: "顧客データの取得に失敗しました",
    });
  });

  it("DB から取れなければ見本の行にせず 500", async () => {
    mocks.connectAppDB.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const res = await get("?type=customers");

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      error: "顧客データの取得に失敗しました",
    });
  });
});
