import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PATCH } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectAppDB: vi.fn(),
  connectDB: vi.fn(),
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  deleteAppUserWithRelatedData: vi.fn(),
  recordAppUserWithdrawal: vi.fn(),
  auditLogCreate: vi.fn(),
  pointTransactionCreate: vi.fn(),
  purchaseFind: vi.fn(),
  buddyLogFind: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  connectAppDB: mocks.connectAppDB,
  connectDB: mocks.connectDB,
}));
vi.mock("@/models/AppUser", () => ({
  getAppUserModel: () => ({
    findById: mocks.findById,
    findByIdAndUpdate: mocks.findByIdAndUpdate,
  }),
}));
vi.mock("@/models/IapPurchaseBinding", () => ({
  getIapPurchaseBindingModel: () => ({ find: mocks.purchaseFind }),
}));
vi.mock("@/models/BuddyPointLog", () => ({
  getBuddyPointLogModel: () => ({ find: mocks.buddyLogFind }),
}));
vi.mock("@/lib/customer-metrics", () => ({
  getLatestWeights: async () => new Map(),
  calculateBmi: () => null,
}));
vi.mock("@/lib/app-user-deletion", () => ({
  deleteAppUserWithRelatedData: mocks.deleteAppUserWithRelatedData,
}));
vi.mock("@/lib/app-user-withdrawal", () => ({
  recordAppUserWithdrawal: mocks.recordAppUserWithdrawal,
}));
vi.mock("@/models/AuditLog", () => ({
  AuditLog: { create: mocks.auditLogCreate },
}));
vi.mock("@/models/PointTransaction", () => ({
  default: { create: mocks.pointTransactionCreate },
}));

const USER_ID = "64b7f0c2a1b2c3d4e5f60001";
const ADMIN_ID = "64b7f0c2a1b2c3d4e5f6aaaa";
const APP_DB = { name: "app-db" };
const SIGNED_UP_AT = new Date("2026-05-01T03:00:00Z");
const APP_USER = {
  _id: USER_ID,
  email: "user@example.com",
  displayName: "山田 花子",
  createdAt: SIGNED_UP_AT,
  isPaid: true,
};

/** Mongoose のクエリ（.select().lean()）の代わり */
function query<T>(result: T) {
  const q = { select: () => q, lean: () => Promise.resolve(result) };
  return q;
}

function sessionAs(role?: string) {
  return { user: { id: ADMIN_ID, email: "admin@example.com", role } };
}

const params = { params: Promise.resolve({ id: USER_ID }) };

function getRequest() {
  return new NextRequest(`http://localhost/admin/api/customers/${USER_ID}`);
}

function deleteRequest() {
  return new NextRequest(`http://localhost/admin/api/customers/${USER_ID}`, {
    method: "DELETE",
    headers: { "x-forwarded-for": "203.0.113.1" },
  });
}

function patchRequest(body: unknown) {
  return new NextRequest(`http://localhost/admin/api/customers/${USER_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connectAppDB.mockResolvedValue(APP_DB);
  mocks.connectDB.mockResolvedValue(undefined);
  mocks.findById.mockReturnValue(query(APP_USER));
  mocks.deleteAppUserWithRelatedData.mockResolvedValue(true);
  mocks.recordAppUserWithdrawal.mockResolvedValue(undefined);
  mocks.auditLogCreate.mockResolvedValue({});
  mocks.purchaseFind.mockReturnValue(query([]));
  mocks.buddyLogFind.mockReturnValue(query([]));
});

describe("GET /api/customers/[id]（課金の記録）", () => {
  it("金額は記録が無いので null。0円と見分けがつかない値を返さない", async () => {
    mocks.auth.mockResolvedValue(sessionAs("ANALYST"));

    const res = await GET(getRequest(), params);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.totalCharge).toBeNull();
    expect(json.data.appVersion).toBeNull();
    expect(json.data.deviceOs).toBeNull();
  });

  it("課金の件数と、課金した端末（重複なし）を返す", async () => {
    mocks.auth.mockResolvedValue(sessionAs("ANALYST"));
    mocks.purchaseFind.mockReturnValue(
      query([
        { platform: "ios", createdAt: new Date("2026-07-01T00:00:00Z") },
        { platform: "android", createdAt: new Date("2026-08-01T00:00:00Z") },
        { platform: "ios", createdAt: new Date("2026-09-01T00:00:00Z") },
      ]),
    );

    const res = await GET(getRequest(), params);
    const json = await res.json();

    expect(mocks.purchaseFind).toHaveBeenCalledWith({ ownerUserId: USER_ID });
    expect(json.data.purchaseCount).toBe(3);
    expect(json.data.purchasePlatforms).toEqual(["ios", "android"]);
  });

  it("課金していなければ 0件・端末なし", async () => {
    mocks.auth.mockResolvedValue(sessionAs("ANALYST"));

    const res = await GET(getRequest(), params);
    const json = await res.json();

    expect(json.data.purchaseCount).toBe(0);
    expect(json.data.purchasePlatforms).toEqual([]);
  });
});

describe("DELETE /api/customers/[id]", () => {
  it("未ログインなら 401 で、何も削除しない", async () => {
    mocks.auth.mockResolvedValue(null);

    const res = await DELETE(deleteRequest(), params);

    expect(res.status).toBe(401);
    expect(mocks.deleteAppUserWithRelatedData).not.toHaveBeenCalled();
    expect(mocks.recordAppUserWithdrawal).not.toHaveBeenCalled();
  });

  it.each([["OPERATOR"], ["ANALYST"], ["SUPPORT"], [undefined]])(
    "SUPER_ADMIN 以外（%s）は 403 で、DB に触らない",
    async (role) => {
      mocks.auth.mockResolvedValue(sessionAs(role));

      const res = await DELETE(deleteRequest(), params);

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ success: false, error: "Forbidden" });
      expect(mocks.connectAppDB).not.toHaveBeenCalled();
      expect(mocks.deleteAppUserWithRelatedData).not.toHaveBeenCalled();
      expect(mocks.recordAppUserWithdrawal).not.toHaveBeenCalled();
      expect(mocks.auditLogCreate).not.toHaveBeenCalled();
    },
  );

  it("SUPER_ADMIN は削除でき、監査ログに削除した顧客を残す", async () => {
    mocks.auth.mockResolvedValue(sessionAs("SUPER_ADMIN"));

    const res = await DELETE(deleteRequest(), params);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { id: USER_ID } });
    expect(mocks.deleteAppUserWithRelatedData).toHaveBeenCalledWith(
      APP_DB,
      USER_ID,
    );
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      adminId: ADMIN_ID,
      adminEmail: "admin@example.com",
      action: "DELETE",
      resource: "AppUser",
      resourceId: USER_ID,
      detail: { email: "user@example.com", displayName: "山田 花子" },
      ipAddress: "203.0.113.1",
    });
  });

  it("APP_MONGODB_URI が未設定なら 503", async () => {
    mocks.auth.mockResolvedValue(sessionAs("SUPER_ADMIN"));
    mocks.connectAppDB.mockResolvedValue(null);

    const res = await DELETE(deleteRequest(), params);

    expect(res.status).toBe(503);
    expect(mocks.deleteAppUserWithRelatedData).not.toHaveBeenCalled();
    expect(mocks.recordAppUserWithdrawal).not.toHaveBeenCalled();
  });

  it("顧客が見つからなければ 404 で、削除処理を呼ばない", async () => {
    mocks.auth.mockResolvedValue(sessionAs("SUPER_ADMIN"));
    mocks.findById.mockReturnValue(query(null));

    const res = await DELETE(deleteRequest(), params);

    expect(res.status).toBe(404);
    expect(mocks.deleteAppUserWithRelatedData).not.toHaveBeenCalled();
    expect(mocks.recordAppUserWithdrawal).not.toHaveBeenCalled();
  });

  it("削除の直前に消えていたら 404 で、監査ログを残さない", async () => {
    mocks.auth.mockResolvedValue(sessionAs("SUPER_ADMIN"));
    mocks.deleteAppUserWithRelatedData.mockResolvedValue(false);

    const res = await DELETE(deleteRequest(), params);

    expect(res.status).toBe(404);
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });

  it("削除の前に、登録日と課金状態を退会として記録する", async () => {
    mocks.auth.mockResolvedValue(sessionAs("SUPER_ADMIN"));
    vi.useFakeTimers({
      now: new Date("2026-09-23T01:00:00Z"),
      toFake: ["Date"],
    });

    try {
      const res = await DELETE(deleteRequest(), params);
      expect(res.status).toBe(200);
    } finally {
      vi.useRealTimers();
    }

    expect(mocks.recordAppUserWithdrawal).toHaveBeenCalledWith(APP_DB, {
      userId: USER_ID,
      withdrawnAt: new Date("2026-09-23T01:00:00Z"),
      signedUpAt: SIGNED_UP_AT,
      wasPaid: true,
      source: "admin",
    });
    expect(
      mocks.recordAppUserWithdrawal.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.deleteAppUserWithRelatedData.mock.invocationCallOrder[0],
    );
  });

  it("登録日も課金の有無も無い古い顧客は、登録日なし・課金なしで記録する", async () => {
    mocks.auth.mockResolvedValue(sessionAs("SUPER_ADMIN"));
    mocks.findById.mockReturnValue(
      query({ _id: USER_ID, email: "old@example.com" }),
    );

    await DELETE(deleteRequest(), params);

    expect(mocks.recordAppUserWithdrawal).toHaveBeenCalledWith(
      APP_DB,
      expect.objectContaining({ signedUpAt: null, wasPaid: false }),
    );
  });

  it("退会の記録に失敗したら削除を中止し、理由を返す", async () => {
    mocks.auth.mockResolvedValue(sessionAs("SUPER_ADMIN"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.recordAppUserWithdrawal.mockRejectedValue(
      new Error("mongodb://secret@host"),
    );

    const res = await DELETE(deleteRequest(), params);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      error: "退会の記録に失敗したため、削除を中止しました",
    });
    expect(mocks.deleteAppUserWithRelatedData).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });

  it("監査ログの記録に失敗しても、削除は成功として返す", async () => {
    mocks.auth.mockResolvedValue(sessionAs("SUPER_ADMIN"));
    mocks.auditLogCreate.mockRejectedValue(new Error("audit error"));

    const res = await DELETE(deleteRequest(), params);

    expect(res.status).toBe(200);
  });

  it("削除処理が失敗したら 500 を返す", async () => {
    mocks.auth.mockResolvedValue(sessionAs("SUPER_ADMIN"));
    mocks.deleteAppUserWithRelatedData.mockRejectedValue(new Error("db error"));

    const res = await DELETE(deleteRequest(), params);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, error: "db error" });
  });
});

describe("PATCH /api/customers/[id]（ポイント手動変更の権限は変えていない）", () => {
  it("OPERATOR は引き続きポイントを変更できる", async () => {
    mocks.auth.mockResolvedValue(sessionAs("OPERATOR"));
    mocks.findById.mockReturnValue(query({ buddyPoints: 100 }));
    mocks.findByIdAndUpdate.mockReturnValue(query({ buddyPoints: 110 }));

    const res = await PATCH(
      patchRequest({ delta: 10, reason: "補填" }),
      params,
    );

    expect(res.status).toBe(200);
    expect((await res.json()).data.newPoints).toBe(110);
  });

  it("ANALYST は 403", async () => {
    mocks.auth.mockResolvedValue(sessionAs("ANALYST"));

    const res = await PATCH(
      patchRequest({ delta: 10, reason: "補填" }),
      params,
    );

    expect(res.status).toBe(403);
    expect(mocks.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});
