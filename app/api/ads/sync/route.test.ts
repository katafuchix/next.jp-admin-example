import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectDB: vi.fn(),
  connectAppDB: vi.fn(),
  runAdSync: vi.fn(),
  createMongoAdSyncStore: vi.fn(),
  recordPaidRateSnapshot: vi.fn(),
  createMongoPaidRateSnapshotStore: vi.fn(),
  countPaidUsers: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  connectDB: mocks.connectDB,
  connectAppDB: mocks.connectAppDB,
}));
vi.mock("@/lib/ad-sync", () => ({ runAdSync: mocks.runAdSync }));
vi.mock("@/lib/ad-sources/store", () => ({
  createMongoAdSyncStore: mocks.createMongoAdSyncStore,
}));
vi.mock("@/lib/user-metrics/paid-snapshot", () => ({
  recordPaidRateSnapshot: mocks.recordPaidRateSnapshot,
  createMongoPaidRateSnapshotStore: mocks.createMongoPaidRateSnapshotStore,
}));
vi.mock("@/lib/user-metrics/query", () => ({
  countPaidUsers: mocks.countPaidUsers,
}));

const SECRET = "test-sync-secret";
const STORE = { name: "store" };
const RESULTS = [
  {
    source: "tenjin",
    label: "Tenjin",
    status: "success",
    rowCount: 7,
    message: null,
  },
];
const PAID_STORE = { name: "paid-store" };
const PAID_RATE = {
  status: "recorded",
  date: "2026-09-23",
  paid: 30,
  total: 120,
};

function post({
  body,
  authorization,
}: { body?: unknown; authorization?: string } = {}) {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return POST(
    new NextRequest("http://localhost/admin/api/ads/sync", {
      method: "POST",
      headers,
      body:
        body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
    }),
  );
}

function syncArgs() {
  return mocks.runAdSync.mock.calls[0][0];
}

function snapshotArgs() {
  return mocks.recordPaidRateSnapshot.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  // JST 2026-09-23 10:00
  vi.useFakeTimers({ now: new Date("2026-09-23T01:00:00Z"), toFake: ["Date"] });
  vi.stubEnv("AD_SYNC_SECRET", SECRET);
  mocks.auth.mockResolvedValue({ user: { id: "admin", role: "OPERATOR" } });
  mocks.connectDB.mockResolvedValue(undefined);
  mocks.createMongoAdSyncStore.mockReturnValue(STORE);
  mocks.runAdSync.mockResolvedValue(RESULTS);
  mocks.createMongoPaidRateSnapshotStore.mockReturnValue(PAID_STORE);
  mocks.recordPaidRateSnapshot.mockResolvedValue(PAID_RATE);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/ads/sync（定期実行）", () => {
  it("正しいシークレットなら、昨日までの7日間を API で取る全媒体ぶん取り込む", async () => {
    mocks.runAdSync.mockResolvedValueOnce(RESULTS).mockResolvedValueOnce([]);
    const res = await post({ authorization: `Bearer ${SECRET}` });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: {
        range: { from: "2026-09-16", to: "2026-09-22" },
        results: RESULTS,
        paidRate: PAID_RATE,
      },
    });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.connectDB).toHaveBeenCalled();
    expect(syncArgs()).toMatchObject({
      trigger: "cron",
      range: { from: "2026-09-16", to: "2026-09-22" },
      store: STORE,
      env: process.env,
    });
    expect(syncArgs().sources.map((s: { id: string }) => s.id)).toEqual([
      "tenjin",
      "admob",
      "adgeneration",
      "appstore",
    ]);
  });

  it("Google Play だけは、翌月上旬に出る手取りを拾えるよう昨日までの62日間を取り直す", async () => {
    mocks.runAdSync
      .mockResolvedValueOnce(RESULTS.slice(0, 1))
      .mockResolvedValueOnce(RESULTS.slice(1));

    const res = await post({ authorization: `Bearer ${SECRET}` });

    expect((await res.json()).data.results).toEqual(RESULTS);
    const second = mocks.runAdSync.mock.calls[1][0];
    expect(second.range).toEqual({ from: "2026-07-23", to: "2026-09-22" });
    expect(second.sources.map((s: { id: string }) => s.id)).toEqual([
      "googleplay",
    ]);
  });

  it("同期のついでに今日（JST）の課金率を記録する", async () => {
    await post({ authorization: `Bearer ${SECRET}` });

    expect(snapshotArgs()).toMatchObject({ store: PAID_STORE });
    expect(snapshotArgs().now.toISOString()).toBe("2026-09-23T01:00:00.000Z");
  });

  it("課金率はアプリDBから数え、アプリDBが未設定なら null を渡す", async () => {
    const conn = { name: "app-db" };
    mocks.connectAppDB.mockResolvedValue(conn);
    mocks.countPaidUsers.mockResolvedValue({ paid: 30, total: 120 });
    await post({ authorization: `Bearer ${SECRET}` });

    expect(await snapshotArgs().countUsers()).toEqual({ paid: 30, total: 120 });
    expect(mocks.countPaidUsers).toHaveBeenCalledWith(conn);

    mocks.connectAppDB.mockResolvedValue(null);
    expect(await snapshotArgs().countUsers()).toBeNull();
  });

  it("広告の同期が落ちても、課金率の記録は先に済ませている", async () => {
    mocks.runAdSync.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post({ authorization: `Bearer ${SECRET}` });

    expect(res.status).toBe(500);
    expect(mocks.recordPaidRateSnapshot).toHaveBeenCalledTimes(1);
  });

  it("シークレットが違えば 401", async () => {
    const res = await post({ authorization: "Bearer wrong" });

    expect(res.status).toBe(401);
    expect(mocks.runAdSync).not.toHaveBeenCalled();
    expect(mocks.recordPaidRateSnapshot).not.toHaveBeenCalled();
  });

  it("サーバー側にシークレットが設定されていなければ、空のシークレットでも通さない", async () => {
    vi.stubEnv("AD_SYNC_SECRET", "");

    const res = await post({ authorization: "Bearer " });

    expect(res.status).toBe(401);
    expect(mocks.runAdSync).not.toHaveBeenCalled();
    expect(mocks.recordPaidRateSnapshot).not.toHaveBeenCalled();
  });
});

describe("POST /api/ads/sync（画面から手動）", () => {
  it("未ログインは 401", async () => {
    mocks.auth.mockResolvedValue(null);

    const res = await post();

    expect(res.status).toBe(401);
    expect(mocks.runAdSync).not.toHaveBeenCalled();
    expect(mocks.recordPaidRateSnapshot).not.toHaveBeenCalled();
  });

  it("閲覧専用のロールは 403", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "a", role: "ANALYST" } });

    const res = await post();

    expect(res.status).toBe(403);
    expect(mocks.runAdSync).not.toHaveBeenCalled();
    expect(mocks.recordPaidRateSnapshot).not.toHaveBeenCalled();
  });

  it("書き込みできるロールなら手動として取り込む", async () => {
    const res = await post();

    expect(res.status).toBe(200);
    expect(syncArgs()).toMatchObject({
      trigger: "manual",
      range: { from: "2026-09-16", to: "2026-09-22" },
    });
  });

  it("期間と媒体を指定できる", async () => {
    await post({
      body: {
        from: "2026-09-01",
        to: "2026-09-23",
        sources: ["admob", "adgeneration"],
      },
    });

    expect(syncArgs().range).toEqual({ from: "2026-09-01", to: "2026-09-23" });
    expect(syncArgs().sources.map((s: { id: string }) => s.id)).toEqual([
      "admob",
      "adgeneration",
    ]);
  });

  // CSV を画面から取り込む媒体を同期に混ぜると、1日2回「取得処理がまだ実装されていません」が記録され、
  // 取り込んだ CSV の記録より新しくなって画面の状態を上書きする
  it("CSV を画面から取り込む媒体（SmaAD）は同期しない。指定されても外す", async () => {
    await post({ body: { sources: ["admob", "smaad"] } });

    expect(syncArgs().sources.map((s: { id: string }) => s.id)).toEqual([
      "admob",
    ]);
  });

  it("SmaAD（広告出稿）は、広告主の API キーとアカウント ID がそろったときだけ同期する", async () => {
    vi.stubEnv("SMAAD_ADVERTISER_API_KEY", "");
    vi.stubEnv("SMAAD_ADVERTISER_ACCOUNT_ID", "999999999");
    await post({ body: { sources: ["admob", "smaad_spend"] } });
    expect(syncArgs().sources.map((s: { id: string }) => s.id)).toEqual([
      "admob",
    ]);

    mocks.runAdSync.mockClear();
    vi.stubEnv("SMAAD_ADVERTISER_API_KEY", "key");
    await post({ body: { sources: ["admob", "smaad_spend"] } });
    expect(syncArgs().sources.map((s: { id: string }) => s.id)).toEqual([
      "smaad_spend",
      "admob",
    ]);
  });

  it.each([
    ["JSON として読めない", "{from:"],
    ["知らない媒体", { sources: ["facebook"] }],
    ["媒体が空", { sources: [] }],
    ["知らない項目", { from: "2026-09-01", dryRun: true }],
    ["日付の形が違う", { from: "2026/09/01" }],
    ["終了日が未来", { to: "2026-09-24" }],
    ["93日を超える", { from: "2026-06-01", to: "2026-09-22" }],
  ])("%s は 400", async (_, body) => {
    const res = await post({ body });

    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
    expect(mocks.runAdSync).not.toHaveBeenCalled();
    expect(mocks.recordPaidRateSnapshot).not.toHaveBeenCalled();
  });

  it("DB接続などで落ちたら 500 を返し、内部のエラー文は出さない", async () => {
    mocks.connectDB.mockRejectedValue(new Error("mongodb://secret@host"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({
      success: false,
      error: "広告データの同期に失敗しました",
    });
  });
});
