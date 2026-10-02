import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  connectAppDB: vi.fn(),
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  sendFCMNotification: vi.fn(),
  countReach: vi.fn(),
  deleteSchedulerJob: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  connectDB: mocks.connectDB,
  connectAppDB: mocks.connectAppDB,
}));
vi.mock("@/models/Notification", () => ({
  default: {
    findById: mocks.findById,
    findByIdAndUpdate: mocks.findByIdAndUpdate,
  },
}));
vi.mock("@/lib/notification-send", () => ({
  sendFCMNotification: mocks.sendFCMNotification,
}));
vi.mock("@/lib/notification-reach", () => ({ countReach: mocks.countReach }));
vi.mock("@/lib/scheduler", () => ({
  deleteSchedulerJob: mocks.deleteSchedulerJob,
}));

const APP_DB = { name: "app-db" };
const NOW = new Date("2026-09-25T01:00:00Z");
const SECRET = "dispatch-secret";

function dispatch(authorization = `Bearer ${SECRET}`) {
  return POST(
    new NextRequest("http://localhost/admin/api/notifications/dispatch/n1", {
      method: "POST",
      headers: { authorization },
    }),
    { params: Promise.resolve({ id: "n1" }) },
  );
}

function notification(overrides: Record<string, unknown> = {}) {
  return {
    title: "今日の記録",
    body: "本文",
    targetSegment: "active",
    status: "scheduled",
    scheduleType: "recurring",
    enabled: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubEnv("NOTIFICATION_DISPATCH_SECRET", SECRET);
  mocks.connectAppDB.mockResolvedValue(APP_DB);
  mocks.findById.mockResolvedValue(notification());
  mocks.sendFCMNotification.mockResolvedValue({ error: null });
  mocks.countReach.mockResolvedValue(8);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/notifications/dispatch/[id]", () => {
  it("共有シークレットが違えば 401", async () => {
    const res = await dispatch("Bearer wrong");

    expect(res.status).toBe(401);
    expect(mocks.sendFCMNotification).not.toHaveBeenCalled();
  });

  it("繰り返し配信は、送るたびに配信数をその回の人数で入れ直す", async () => {
    const res = await dispatch();

    expect(res.status).toBe(200);
    expect(mocks.countReach).toHaveBeenCalledWith(APP_DB, "active", NOW);
    expect(mocks.findByIdAndUpdate).toHaveBeenCalledWith("n1", {
      lastDispatchedAt: NOW,
      totalTargets: 8,
    });
  });

  it("単発予約は配信済みにして、配信数を入れる", async () => {
    mocks.findById.mockResolvedValue(notification({ scheduleType: "once" }));

    await dispatch();

    expect(mocks.findByIdAndUpdate).toHaveBeenCalledWith("n1", {
      lastDispatchedAt: NOW,
      totalTargets: 8,
      status: "sent",
      sentAt: NOW,
    });
  });

  it("アプリのデータベースにつながらないときは送らない（再試行させる）", async () => {
    mocks.connectAppDB.mockResolvedValue(null);

    const res = await dispatch();

    expect(res.status).toBe(503);
    expect(mocks.sendFCMNotification).not.toHaveBeenCalled();
    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("無効にした通知は送らず、人数も数えない", async () => {
    mocks.findById.mockResolvedValue(notification({ enabled: false }));

    const res = await dispatch();

    expect(await res.json()).toMatchObject({
      skipped: true,
      reason: "disabled",
    });
    expect(mocks.countReach).not.toHaveBeenCalled();
    expect(mocks.sendFCMNotification).not.toHaveBeenCalled();
  });

  it("送信に失敗したら記録を更新しない", async () => {
    mocks.sendFCMNotification.mockResolvedValue({ error: "FCM down" });

    const res = await dispatch();

    expect(res.status).toBe(500);
    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
