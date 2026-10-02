import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectDB: vi.fn(),
  countDocuments: vi.fn(),
  find: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@/lib/scheduler", () => ({ syncSchedulerJob: vi.fn() }));
vi.mock("@/models/Notification", () => ({
  default: { countDocuments: mocks.countDocuments, find: mocks.find },
}));

/** Mongoose のクエリ（.sort().skip().limit().lean()）の代わり */
function query<T>(result: T) {
  const q = {
    sort: vi.fn(() => q),
    skip: vi.fn(() => q),
    limit: vi.fn(() => q),
    lean: () => Promise.resolve(result),
  };
  return q;
}

function get() {
  return GET(new NextRequest("http://localhost/admin/api/notifications"));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ user: { id: "admin", role: "ANALYST" } });
  mocks.countDocuments.mockResolvedValue(1);
  mocks.find.mockReturnValue(
    query([
      {
        _id: "n1",
        title: "お知らせ",
        body: "本文",
        targetSegment: "all",
        status: "sent",
        totalTargets: 0,
      },
    ]),
  );
});

describe("GET /api/notifications", () => {
  it("配信数は記録した人数をそのまま返す（0 でも 0）", async () => {
    const res = await get();

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data[0]).toMatchObject({ id: "n1", reachCount: 0 });
  });

  it("開封は計測していないので、開封数を返さない", async () => {
    const json = await (await get()).json();

    expect(json.data[0]).not.toHaveProperty("openCount");
  });

  it("読み込みに失敗したら、空の一覧を成功として返さずにエラーにする", async () => {
    mocks.countDocuments.mockRejectedValue(new Error("boom"));

    const res = await get();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      error: "通知の一覧を読み込めませんでした",
    });
  });
});
