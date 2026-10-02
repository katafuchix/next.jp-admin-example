import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectAppDB: vi.fn(),
  fetchUserMetrics: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ connectAppDB: mocks.connectAppDB }));
vi.mock("@/lib/user-metrics/query", () => ({
  fetchUserMetrics: mocks.fetchUserMetrics,
}));

const APP_DB = { name: "app-db" };

function get(query = "") {
  return GET(
    new NextRequest(`http://localhost/admin/api/user-metrics${query}`),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // JST 2026-09-23 10:00
  vi.useFakeTimers({ now: new Date("2026-09-23T01:00:00Z"), toFake: ["Date"] });
  mocks.auth.mockResolvedValue({ user: { id: "admin", role: "viewer" } });
  mocks.connectAppDB.mockResolvedValue(APP_DB);
  mocks.fetchUserMetrics.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/user-metrics", () => {
  it("未ログインは 401", async () => {
    mocks.auth.mockResolvedValue(null);

    const res = await get();

    expect(res.status).toBe(401);
    expect(mocks.fetchUserMetrics).not.toHaveBeenCalled();
  });

  it("期間の指定が無ければ、昨日までの30日間（JST）を集計する", async () => {
    const res = await get();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { ok: true } });
    expect(mocks.fetchUserMetrics).toHaveBeenCalledWith(APP_DB, {
      from: "2026-08-24",
      to: "2026-09-22",
      today: "2026-09-23",
    });
  });

  it("指定された期間をそのまま渡す", async () => {
    await get("?from=2026-09-01&to=2026-09-10");

    expect(mocks.fetchUserMetrics).toHaveBeenCalledWith(APP_DB, {
      from: "2026-09-01",
      to: "2026-09-10",
      today: "2026-09-23",
    });
  });

  it.each([
    ["日付の形が違う", "?from=2026/09/01&to=2026-09-10"],
    ["存在しない日付", "?from=2026-02-30&to=2026-03-10"],
    ["開始日が終了日より後", "?from=2026-09-10&to=2026-09-01"],
    ["366日を超える", "?from=2025-01-01&to=2026-09-01"],
  ])("%s は 400", async (_, query) => {
    const res = await get(query);

    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
    expect(mocks.fetchUserMetrics).not.toHaveBeenCalled();
  });

  it("アプリDBにつながっていなければ 503", async () => {
    mocks.connectAppDB.mockResolvedValue(null);

    const res = await get();

    expect(res.status).toBe(503);
  });

  it("集計で失敗したら 500 を返し、内部のエラー文は出さない", async () => {
    mocks.fetchUserMetrics.mockRejectedValue(new Error("secret detail"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await get();
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json).toEqual({
      success: false,
      error: "ユーザー指標の取得に失敗しました",
    });
  });
});
