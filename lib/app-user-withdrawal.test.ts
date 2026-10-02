import type { Connection } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordAppUserWithdrawal } from "./app-user-withdrawal";

const mocks = vi.hoisted(() => ({ updateOne: vi.fn() }));

vi.mock("@/models/AppUserWithdrawal", () => ({
  getAppUserWithdrawalModel: () => ({ updateOne: mocks.updateOne }),
}));

const CONN = {} as Connection;
const USER_ID = "64b7f0c2a1b2c3d4e5f60001";
const WITHDRAWN_AT = new Date("2026-09-23T01:00:00Z");
const SIGNED_UP_AT = new Date("2026-05-01T03:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.updateOne.mockResolvedValue({});
});

describe("recordAppUserWithdrawal", () => {
  it("userId ごとに1行だけ作り、やり直しでは最初の記録を書き換えない", async () => {
    await recordAppUserWithdrawal(CONN, {
      userId: USER_ID,
      withdrawnAt: WITHDRAWN_AT,
      signedUpAt: SIGNED_UP_AT,
      wasPaid: true,
      source: "admin",
    });

    expect(mocks.updateOne).toHaveBeenCalledWith(
      { userId: USER_ID },
      {
        $setOnInsert: {
          withdrawnAt: WITHDRAWN_AT,
          signedUpAt: SIGNED_UP_AT,
          wasPaid: true,
          source: "admin",
        },
      },
      { upsert: true },
    );
  });

  it("保存に失敗したら例外をそのまま投げる（呼び出し側が削除を止める）", async () => {
    mocks.updateOne.mockRejectedValue(new Error("write failed"));

    await expect(
      recordAppUserWithdrawal(CONN, {
        userId: USER_ID,
        withdrawnAt: WITHDRAWN_AT,
        signedUpAt: null,
        wasPaid: false,
        source: "admin",
      }),
    ).rejects.toThrow("write failed");
  });
});
