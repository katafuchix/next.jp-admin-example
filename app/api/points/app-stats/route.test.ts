import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectAppDB: vi.fn(),
  fetchAppPointStats: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ connectAppDB: mocks.connectAppDB }));
vi.mock("@/lib/app-points/query", () => ({
  fetchAppPointStats: mocks.fetchAppPointStats,
}));

const APP_DB = { name: "app-db" };

function get(query = "") {
  return GET(
    new NextRequest(`http://localhost/admin/api/points/app-stats${query}`),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // JST 2026-09-25 10:00
  vi.useFakeTimers({ now: new Date("2026-09-25T01:00:00Z"), toFake: ["Date"] });
  mocks.auth.mockResolvedValue({ user: { id: "admin", role: "viewer" } });
  mocks.connectAppDB.mockResolvedValue(APP_DB);
  mocks.fetchAppPointStats.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/points/app-stats", () => {
  it("未ログインは 401", async () => {
    mocks.auth.mockResolvedValue(null);

    const res = await get();

    expect(res.status).toBe(401);
    expect(mocks.fetchAppPointStats).not.toHaveBeenCalled();
  });

  it("期間の指定が無ければ、昨日までの30日間（JST）を集計する", async () => {
    const res = await get();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { ok: true } });
    expect(mocks.fetchAppPointStats).toHaveBeenCalledWith(APP_DB, {
      from: "2026-08-26",
      to: "2026-09-24",
    });
  });

  it("指定された期間をそのまま渡す", async () => {
    await get("?from=2026-09-01&to=2026-09-10");

    expect(mocks.fetchAppPointStats).toHaveBeenCalledWith(APP_DB, {
      from: "2026-09-01",
      to: "2026-09-10",
    });
  });

  it.each([
    ["日付の形が違う", "?from=2026/09/01&to=2026-09-10"],
    ["開始日が終了日より後", "?from=2026-09-10&to=2026-09-01"],
    ["366日を超える", "?from=2025-01-01&to=2026-09-01"],
  ])("%s は 400", async (_, query) => {
    const res = await get(query);

    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
    expect(mocks.fetchAppPointStats).not.toHaveBeenCalled();
  });

  it("アプリのDBにつながらない設定なら 503（見本の数字で埋めない）", async () => {
    mocks.connectAppDB.mockResolvedValue(null);

    const res = await get();

    expect(res.status).toBe(503);
    expect((await res.json()).success).toBe(false);
  });

  it("集計に失敗したら 500", async () => {
    mocks.fetchAppPointStats.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await get();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      error: "ポイントの集計に失敗しました",
    });
  });
});
