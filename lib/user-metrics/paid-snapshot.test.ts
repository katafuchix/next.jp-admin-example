import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMongoPaidRateSnapshotStore,
  recordPaidRateSnapshot,
  type PaidRateSnapshotStore,
} from "./paid-snapshot";

const mocks = vi.hoisted(() => ({ updateOne: vi.fn() }));

vi.mock("@/models/PaidRateSnapshot", () => ({
  PaidRateSnapshot: { updateOne: mocks.updateOne },
}));

// JST 2026-09-23 01:00（UTC ではまだ 09-22）
const NOW = new Date("2026-09-22T16:00:00Z");

function fakeStore(upsert = vi.fn().mockResolvedValue(undefined)) {
  const store: PaidRateSnapshotStore = { upsert };
  return { store, upsert };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordPaidRateSnapshot", () => {
  it("今の課金中・総ユーザー数を、JST の今日の1行として残す", async () => {
    const { store, upsert } = fakeStore();

    const result = await recordPaidRateSnapshot({
      countUsers: async () => ({ paid: 30, total: 120 }),
      store,
      now: NOW,
    });

    expect(upsert).toHaveBeenCalledWith({
      date: "2026-09-23",
      paid: 30,
      total: 120,
      recordedAt: NOW,
    });
    expect(result).toEqual({
      status: "recorded",
      date: "2026-09-23",
      paid: 30,
      total: 120,
    });
  });

  it("アプリDBが未設定なら書かずに「スキップ」を返す", async () => {
    const { store, upsert } = fakeStore();

    const result = await recordPaidRateSnapshot({
      countUsers: async () => null,
      store,
      now: NOW,
    });

    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "skipped",
      message: "アプリDBが未設定のため課金率を記録していません",
    });
  });

  it("数えられなくても例外は投げず、内部のエラー文を出さずに「失敗」を返す", async () => {
    const { store, upsert } = fakeStore();

    const result = await recordPaidRateSnapshot({
      countUsers: () => Promise.reject(new Error("mongodb://secret@host")),
      store,
      now: NOW,
    });

    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "failed",
      message: "課金率の記録に失敗しました",
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("保存で落ちても例外は投げず「失敗」を返す", async () => {
    const { store } = fakeStore(
      vi.fn().mockRejectedValue(new Error("write failed")),
    );

    const result = await recordPaidRateSnapshot({
      countUsers: async () => ({ paid: 1, total: 2 }),
      store,
      now: NOW,
    });

    expect(result).toEqual({
      status: "failed",
      message: "課金率の記録に失敗しました",
    });
  });
});

describe("createMongoPaidRateSnapshotStore", () => {
  it("日付で上書きする（同じ日に何度記録しても1行）", async () => {
    await createMongoPaidRateSnapshotStore().upsert({
      date: "2026-09-23",
      paid: 30,
      total: 120,
      recordedAt: NOW,
    });

    expect(mocks.updateOne).toHaveBeenCalledWith(
      { date: "2026-09-23" },
      { $set: { paid: 30, total: 120, recordedAt: NOW } },
      { upsert: true },
    );
  });
});
