import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectDB: vi.fn(),
  find: vi.fn(),
  findByIdAndUpdate: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@/models/LPPage", () => ({
  default: { find: mocks.find, findByIdAndUpdate: mocks.findByIdAndUpdate },
}));

const LP = { _id: "lp1", slug: "summer", sessions: 1000, conversions: 10 };

function syncRequest(body?: unknown) {
  return new NextRequest("http://localhost/admin/api/lp/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "");
  mocks.auth.mockResolvedValue({ user: { id: "a1", role: "OPERATOR" } });
  mocks.connectDB.mockResolvedValue(undefined);
  mocks.find.mockReturnValue({ lean: () => Promise.resolve([LP]) });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/lp/sync", () => {
  it("GA4 が未設定なら 503 で、セッション数を書き換えない", async () => {
    const res = await POST(syncRequest({ slug: "summer" }));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.success).toBe(false);
    expect(json.error).toContain("GA4");
    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("GA4 の読み取り部品が入っていなければ 503 で、セッション数を書き換えない", async () => {
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "{}");

    const res = await POST(syncRequest({ slug: "summer" }));
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toContain("@google-analytics/data");
    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("閲覧だけのロールは 403", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "a1", role: "ANALYST" } });

    const res = await POST(syncRequest({ slug: "summer" }));

    expect(res.status).toBe(403);
    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
