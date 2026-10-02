import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectDB: vi.fn(),
  connectAppDB: vi.fn(),
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  sendFCMNotification: vi.fn(),
  countReach: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
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
  SEGMENT_TOPIC_MAP: { all: "hapiken-all", premium: "hapiken-premium" },
  sendFCMNotification: mocks.sendFCMNotification,
}));
vi.mock("@/lib/notification-reach", () => ({ countReach: mocks.countReach }));

const APP_DB = { name: "app-db" };
const NOW = new Date("2026-09-25T01:00:00Z");

function send() {
  return POST(
    new NextRequest("http://localhost/admin/api/notifications/n1/send", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "n1" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_KEY", "configured");
  mocks.auth.mockResolvedValue({ user: { id: "admin", role: "OPERATOR" } });
  mocks.connectAppDB.mockResolvedValue(APP_DB);
  mocks.findById.mockResolvedValue({
    title: "お知らせ",
    body: "本文",
    targetSegment: "premium",
    status: "draft",
    totalTargets: 0,
  });
  mocks.sendFCMNotification.mockResolvedValue({ error: null });
  mocks.countReach.mockResolvedValue(42);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/notifications/[id]/send", () => {
  it("送ると配信済みにし、配信数には区分の中で通知を受け取れる人数の実数を入れる", async () => {
    const res = await send();

    expect(res.status).toBe(200);
    expect(mocks.countReach).toHaveBeenCalledWith(APP_DB, "premium", NOW);
    expect(mocks.sendFCMNotification).toHaveBeenCalledWith(
      "お知らせ",
      "本文",
      "premium",
    );
    expect(mocks.findByIdAndUpdate).toHaveBeenCalledWith("n1", {
      status: "sent",
      sentAt: NOW,
      totalTargets: 42,
    });
  });

  it("通知の鍵が未設定なら送らず、配信済みにもしない（作り物の数字を入れない）", async () => {
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_KEY", "");

    const res = await send();

    expect(res.status).toBe(503);
    expect((await res.json()).success).toBe(false);
    expect(mocks.sendFCMNotification).not.toHaveBeenCalled();
    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("アプリのデータベースにつながらないと人数を数えられないので、送らない", async () => {
    mocks.connectAppDB.mockResolvedValue(null);

    const res = await send();

    expect(res.status).toBe(503);
    expect(mocks.sendFCMNotification).not.toHaveBeenCalled();
    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("送信に失敗したら配信済みにしない", async () => {
    mocks.sendFCMNotification.mockResolvedValue({ error: "FCM down" });

    const res = await send();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: "FCM down" });
    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("配信済みの通知は送り直さない", async () => {
    mocks.findById.mockResolvedValue({ status: "sent" });

    const res = await send();

    expect(res.status).toBe(400);
    expect(mocks.sendFCMNotification).not.toHaveBeenCalled();
  });

  it("閲覧だけの権限では送れない", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "v", role: "ANALYST" } });

    const res = await send();

    expect(res.status).toBe(403);
    expect(mocks.sendFCMNotification).not.toHaveBeenCalled();
  });
});
