// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/components/features/user-metrics/fixtures";
import CustomersPage from "./page";

const mocks = vi.hoisted(() => ({ useAppSession: vi.fn(), push: vi.fn() }));

vi.mock("@/app/session-context", () => ({
  useAppSession: mocks.useAppSession,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

function customer(userId: string, name: string) {
  return {
    userId,
    email: `${userId}@example.com`,
    name,
    status: "online",
    plan: "free",
    createdAt: "2026-09-01T00:00:00Z",
    lastLoginAt: "2026-09-20T00:00:00Z",
    loginStreakDays: 0,
    age: null,
    gender: null,
    residence: null,
  };
}

const fetchMock = vi.fn();
const queries = () =>
  fetchMock.mock.calls.map(
    ([url]) => new URL(String(url), "http://localhost").searchParams,
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocks.useAppSession.mockReturnValue({ user: { role: "OPERATOR" } });
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const page = new URL(String(input), "http://localhost").searchParams.get(
      "page",
    );
    return jsonResponse({
      success: true,
      data: [customer(`u${page}`, `顧客${page}`)],
      meta: { total: 45, page: Number(page), limit: 20 },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("顧客一覧", () => {
  it("読み込んだ顧客を出す", async () => {
    render(<CustomersPage />);

    expect(await screen.findByText("顧客1")).toBeTruthy();
    expect(screen.getByText("45件中 1–20件を表示")).toBeTruthy();
  });

  // 前のページ番号のまま新しい条件で取りに行くと、1回余計に取り、一瞬ずれた一覧が出る
  it("2ページ目で絞り込みを変えたら、1ページ目から取り直す", async () => {
    render(<CustomersPage />);
    await screen.findByText("顧客1");
    fireEvent.click(screen.getByRole("button", { name: "›" }));
    await screen.findByText("顧客2");

    fireEvent.click(screen.getByRole("button", { name: "オンライン" }));
    await screen.findByText("顧客1");

    const online = queries().filter((q) => q.get("status") === "online");
    expect(online.map((q) => q.get("page"))).toEqual(["1"]);
  });

  it("絞り込みを変えた直後は、前の条件の一覧を出さない（読み込み中）", async () => {
    render(<CustomersPage />);
    await screen.findByText("顧客1");
    fetchMock.mockImplementation(() => new Promise(() => {}));

    fireEvent.click(screen.getByRole("button", { name: "オンライン" }));

    expect(screen.queryByText("顧客1")).toBeNull();
    expect(screen.queryByText(/件を表示/)).toBeNull();
  });

  it("取得できなかったら理由を出し、取り直せたら消す", async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ success: false, error: "DB エラー" }, 500),
    );
    render(<CustomersPage />);

    expect(
      await screen.findByText("顧客データの取得に失敗しました"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "オンライン" }));
    await screen.findByText("顧客1");
    await waitFor(() =>
      expect(screen.queryByText("顧客データの取得に失敗しました")).toBeNull(),
    );
  });
});
