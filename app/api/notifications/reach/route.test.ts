import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectAppDB: vi.fn(),
  countReachBySegment: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ connectAppDB: mocks.connectAppDB }));
vi.mock("@/lib/notification-reach", () => ({
  countReachBySegment: mocks.countReachBySegment,
}));

const APP_DB = { name: "app-db" };
const NOW = new Date("2026-09-25T01:00:00Z");
const COUNTS = { all: 12, active: 7, inactive: 5, premium: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ user: { id: "admin", role: "ANALYST" } });
  mocks.connectAppDB.mockResolvedValue(APP_DB);
  mocks.countReachBySegment.mockResolvedValue(COUNTS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/notifications/reach", () => {
  it("未ログインは 401", async () => {
    mocks.auth.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(mocks.countReachBySegment).not.toHaveBeenCalled();
  });

  it("いま送ったら届く人数を区分ごとに返す", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { counts: COUNTS, countedAt: NOW.toISOString() },
    });
    expect(mocks.countReachBySegment).toHaveBeenCalledWith(APP_DB, NOW);
  });

  it("アプリのデータベースが未設定なら 503", async () => {
    mocks.connectAppDB.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(503);
  });

  it("数えられなかったら 500", async () => {
    mocks.countReachBySegment.mockRejectedValue(new Error("boom"));

    const res = await GET();

    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });
});
