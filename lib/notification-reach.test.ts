import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Connection } from "mongoose";
import {
  countReach,
  countReachBySegment,
  reachFilter,
} from "./notification-reach";

const mocks = vi.hoisted(() => ({ countDocuments: vi.fn() }));

vi.mock("@/models/AppUser", () => ({
  getAppUserModel: () => ({ countDocuments: mocks.countDocuments }),
}));

const CONN = {} as Connection;
const NOW = new Date("2026-09-25T01:00:00Z");
const CUTOFF = new Date("2026-08-26T01:00:00Z");
const HAS_TOKEN = { "fcmTokens.0": { $exists: true } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reachFilter", () => {
  it("全体は、通知の受け取り先（端末）を1つ以上登録している人", () => {
    expect(reachFilter("all", NOW)).toEqual(HAS_TOKEN);
  });

  it("アクティブは、アプリと同じく直近30日以内にアプリを開いた人", () => {
    expect(reachFilter("active", NOW)).toEqual({
      ...HAS_TOKEN,
      lastAppOpenAt: { $gt: CUTOFF },
    });
  });

  it("非アクティブは、30日以上開いていない人と、開いた記録が無い人", () => {
    expect(reachFilter("inactive", NOW)).toEqual({
      ...HAS_TOKEN,
      $or: [{ lastAppOpenAt: { $lte: CUTOFF } }, { lastAppOpenAt: null }],
    });
  });

  it("プレミアム会員は課金中の人", () => {
    expect(reachFilter("premium", NOW)).toEqual({ ...HAS_TOKEN, isPaid: true });
  });

  it("知らない区分は、送信側と同じく全体として数える", () => {
    expect(reachFilter("unknown", NOW)).toEqual(HAS_TOKEN);
  });
});

describe("countReach", () => {
  it("区分の条件でアプリのユーザーを数える", async () => {
    mocks.countDocuments.mockResolvedValue(12);

    await expect(countReach(CONN, "premium", NOW)).resolves.toBe(12);
    expect(mocks.countDocuments).toHaveBeenCalledWith({
      ...HAS_TOKEN,
      isPaid: true,
    });
  });

  it("数えられなかったときは握り潰さずに投げる", async () => {
    mocks.countDocuments.mockRejectedValue(new Error("boom"));

    await expect(countReach(CONN, "all", NOW)).rejects.toThrow("boom");
  });
});

describe("countReachBySegment", () => {
  it("4つの区分をそれぞれ数える", async () => {
    mocks.countDocuments.mockImplementation(async (filter: object) => {
      if ("isPaid" in filter) return 3;
      if ("$or" in filter) return 5;
      if ("lastAppOpenAt" in filter) return 7;
      return 12;
    });

    await expect(countReachBySegment(CONN, NOW)).resolves.toEqual({
      all: 12,
      active: 7,
      inactive: 5,
      premium: 3,
    });
  });
});
