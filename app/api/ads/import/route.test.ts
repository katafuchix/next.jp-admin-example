import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdSourceError } from "@/lib/ad-sources/types";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  connectDB: vi.fn(),
  importAdRows: vi.fn(),
  createMongoAdSyncStore: vi.fn(),
  parseCsv: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@/lib/ad-sync", () => ({ importAdRows: mocks.importAdRows }));
vi.mock("@/lib/ad-sources/store", () => ({
  createMongoAdSyncStore: mocks.createMongoAdSyncStore,
}));
// CSV を取り込めるのは SmaAD だけ、Tenjin は API で取る、という媒体一覧にする
vi.mock("@/lib/ad-sources/registry", () => ({
  AD_SOURCES: [
    { id: "tenjin", label: "Tenjin", provides: "", requiredEnv: [] },
    {
      id: "smaad",
      label: "SmaAD",
      provides: "",
      requiredEnv: [],
      parseCsv: mocks.parseCsv,
    },
  ],
}));

const STORE = { name: "store" };
const ROWS = [
  { date: "2026-09-01", key: "total", metrics: { revenue: 120 } },
  { date: "2026-09-02", key: "total", metrics: { revenue: 80 } },
];
const RESULT = {
  source: "smaad",
  label: "SmaAD",
  range: { from: "2026-09-01", to: "2026-09-02" },
  rowCount: 2,
};
const CSV = "日付,発生金額\n2026/09/01,120\n2026/09/02,80\n";

function post({
  source = "smaad",
  file = new File([CSV], "report.csv", { type: "text/csv" }),
}: { source?: string | null; file?: File | string | null } = {}) {
  const form = new FormData();
  if (source !== null) form.set("source", source);
  if (file !== null) form.set("file", file);
  return POST(
    new NextRequest("http://localhost/admin/api/ads/import", {
      method: "POST",
      body: form,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "admin", role: "OPERATOR" } });
  mocks.connectDB.mockResolvedValue(undefined);
  mocks.createMongoAdSyncStore.mockReturnValue(STORE);
  mocks.parseCsv.mockReturnValue(ROWS);
  mocks.importAdRows.mockResolvedValue(RESULT);
});

describe("POST /api/ads/import", () => {
  it("CSV を読んだ行を、その媒体の取り込みとして保存する", async () => {
    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: RESULT });
    const bytes: Uint8Array = mocks.parseCsv.mock.calls[0][0];
    expect(new TextDecoder().decode(bytes)).toBe(CSV);
    expect(mocks.connectDB).toHaveBeenCalled();
    expect(mocks.importAdRows).toHaveBeenCalledWith({
      source: expect.objectContaining({ id: "smaad" }),
      rows: ROWS,
      store: STORE,
    });
  });

  it("未ログインは 401", async () => {
    mocks.auth.mockResolvedValue(null);

    const res = await post();

    expect(res.status).toBe(401);
    expect(mocks.importAdRows).not.toHaveBeenCalled();
  });

  it("閲覧専用のロールは 403", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "a", role: "ANALYST" } });

    const res = await post();

    expect(res.status).toBe(403);
    expect(mocks.importAdRows).not.toHaveBeenCalled();
  });

  it.each([
    ["媒体の指定が無い", { source: null }, "CSV を取り込めない媒体です"],
    ["API で取る媒体", { source: "tenjin" }, "CSV を取り込めない媒体です"],
    ["知らない媒体", { source: "facebook" }, "CSV を取り込めない媒体です"],
    ["ファイルが無い", { file: null }, "CSV ファイルを選んでください"],
    [
      "ファイルではなく文字",
      { file: "日付,発生金額" },
      "CSV ファイルを選んでください",
    ],
    [
      "空のファイル",
      { file: new File([], "empty.csv", { type: "text/csv" }) },
      "CSV ファイルを選んでください",
    ],
    [
      "512KB を超える",
      { file: new File(["a".repeat(512 * 1024 + 1)], "big.csv") },
      "CSV は 512KB 以下にしてください",
    ],
  ])("%s は 400 で、何も保存しない", async (_, args, error) => {
    const res = await post(args);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error });
    expect(mocks.importAdRows).not.toHaveBeenCalled();
  });

  it("CSV の形が違えば、読み取り処理の理由をそのまま 400 で返す", async () => {
    mocks.parseCsv.mockImplementation(() => {
      throw new AdSourceError("「発生金額」の列が見つかりません");
    });

    const res = await post();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: "「発生金額」の列が見つかりません",
    });
    expect(mocks.importAdRows).not.toHaveBeenCalled();
  });

  it("読み取り処理が想定外の理由で落ちたら、理由を伏せて 400", async () => {
    mocks.parseCsv.mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined");
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: "CSV を読み取れませんでした",
    });
    expect(logged).toHaveBeenCalled();
    expect(mocks.importAdRows).not.toHaveBeenCalled();
  });

  it("行の中身がおかしければ（期間外・重複など）理由をそのまま 400 で返す", async () => {
    mocks.importAdRows.mockRejectedValue(
      new AdSourceError(
        "同じ日付・キーの行が重複しています（2026-09-01 / total）",
      ),
    );

    const res = await post();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: "同じ日付・キーの行が重複しています（2026-09-01 / total）",
    });
  });

  it("保存に失敗したら、理由を伏せて 500（ログには残す）", async () => {
    mocks.importAdRows.mockRejectedValue(
      new Error("MongoServerError: timeout"),
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await post();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      success: false,
      error: "CSV の取り込みに失敗しました",
    });
    expect(logged).toHaveBeenCalled();
  });
});
