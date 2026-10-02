// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/components/features/user-metrics/fixtures";
import LPPage from "./page";

const mocks = vi.hoisted(() => ({ useAppSession: vi.fn() }));

vi.mock("@/app/session-context", () => ({
  useAppSession: mocks.useAppSession,
}));

const LP = {
  name: "夏のキャンペーン",
  slug: "summer",
  url: "https://example.com/summer",
  isActive: true,
  sessions: 1000,
  conversions: 10,
  revenue: 0,
};

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  mocks.useAppSession.mockReturnValue({ user: { role: "OPERATOR" } });
  fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
    String(input).endsWith("/lp/sync")
      ? jsonResponse(
          {
            success: false,
            error:
              "GA4 の接続（GOOGLE_APPLICATION_CREDENTIALS_JSON）が未設定のため同期できません",
          },
          503,
        )
      : jsonResponse({ success: true, data: [LP] }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LP効果分析の同期", () => {
  it("同期できなかったら理由を出す（黙って何もしない、にしない）", async () => {
    render(<LPPage />);

    fireEvent.click(await screen.findByRole("button", { name: "同期" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("GA4 の接続");
    expect(screen.getByText("夏のキャンペーン")).toBeTruthy();
  });

  it("同期は押した LP の slug を送る", async () => {
    render(<LPPage />);

    fireEvent.click(await screen.findByRole("button", { name: "同期" }));
    await screen.findByRole("alert");

    const syncCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/lp/sync"),
    );
    expect(JSON.parse(String(syncCall?.[1]?.body))).toEqual({ slug: "summer" });
  });

  it("同期に成功したら一覧を取り直し、前回の失敗の表示を消す", async () => {
    let syncCount = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (!String(input).endsWith("/lp/sync")) {
        return jsonResponse({ success: true, data: [LP] });
      }
      syncCount += 1;
      return syncCount === 1
        ? jsonResponse({ success: false, error: "一時的に同期できません" }, 503)
        : jsonResponse({ success: true });
    });
    const listCalls = () =>
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("/admin/api/lp"),
      ).length;
    render(<LPPage />);

    fireEvent.click(await screen.findByRole("button", { name: "同期" }));
    await screen.findByRole("alert");
    expect(listCalls()).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "同期" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    await screen.findByText("夏のキャンペーン");
    expect(listCalls()).toBe(2);
  });
});

describe("LP効果分析の一覧", () => {
  it("取得できなかったら理由を出す", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ success: false, error: "DB エラー" }, 500),
    );
    render(<LPPage />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("LPデータの取得に失敗しました");
    expect(screen.getByText("登録されたLPがありません")).toBeTruthy();
  });
});
