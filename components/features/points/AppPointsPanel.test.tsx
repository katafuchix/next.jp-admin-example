// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppPointStats } from "@/lib/app-points/query";
import { jsonResponse } from "@/components/features/user-metrics/fixtures";
import { AppPointsPanel } from "./AppPointsPanel";

const fetchMock = vi.fn();

function card(name: string) {
  return within(screen.getByRole("group", { name }));
}

function buildStats(overrides: Partial<AppPointStats> = {}): AppPointStats {
  return {
    range: { from: "2026-08-26", to: "2026-09-24" },
    totals: {
      earned: 18839,
      earnCount: 6163,
      spent: 4500,
      spendCount: 45,
      users: 1203,
    },
    balance: { total: 98765, holders: 2345 },
    bySource: [
      {
        type: "earn",
        source: "login_bonus",
        label: "ログインボーナス",
        count: 6163,
        points: 18839,
        users: 1200,
      },
      {
        type: "spend",
        source: "gacha",
        label: "ガチャ",
        count: 45,
        points: 4500,
        users: 12,
      },
    ],
    recent: [
      {
        id: "log1",
        createdAt: "2026-09-24T03:05:00.000Z",
        userId: "u1",
        userName: "はなこ",
        type: "spend",
        source: "gacha",
        label: "ガチャ",
        amount: -100,
        balanceAfter: 1520,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  // JST 2026-09-25 10:00
  vi.useFakeTimers({ now: new Date("2026-09-25T01:00:00Z"), toFake: ["Date"] });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    jsonResponse({ success: true, data: buildStats() }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AppPointsPanel", () => {
  it("昨日までの30日間を取りに行く", async () => {
    render(<AppPointsPanel />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/admin/api/points/app-stats?from=2026-08-26&to=2026-09-24",
    );
  });

  it("付与・消費・人数・今の残高を出す", async () => {
    render(<AppPointsPanel />);

    await waitFor(() =>
      expect(card("付与したポイント").getByText("18,839")).toBeTruthy(),
    );
    expect(card("付与したポイント").getByText("6,163件")).toBeTruthy();
    expect(card("使われたポイント").getByText("4,500")).toBeTruthy();
    expect(card("使われたポイント").getByText("45件")).toBeTruthy();
    expect(card("ポイントが動いた人数").getByText("1,203")).toBeTruthy();
    expect(card("未使用のポイント残高").getByText("98,765")).toBeTruthy();
    expect(
      card("未使用のポイント残高").getByText(/残高のある人 2,345人/),
    ).toBeTruthy();
  });

  it("内訳を、区分を文字でも示して出す", async () => {
    render(<AppPointsPanel />);

    const table = await screen.findByRole("table", { name: "ポイントの内訳" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      "付与ログインボーナス6,16318,8391,200",
      "消費ガチャ45-4,50012",
    ]);
  });

  it("直近の記録を JST の日時で出し、名前から顧客詳細へ行ける", async () => {
    render(<AppPointsPanel />);

    const table = await screen.findByRole("table", { name: "直近の記録" });
    const row = within(table).getAllByRole("row")[1];
    expect(row.textContent).toBe("9月24日 12:05はなこガチャ-1001,520");
    expect(
      within(row).getByRole("link", { name: "はなこ" }).getAttribute("href"),
    ).toBe("/customers/u1");
  });

  it("記録が無い期間は、無いと書く", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: buildStats({ bySource: [], recent: [] }),
      }),
    );

    render(<AppPointsPanel />);

    expect(
      await screen.findByText("この期間のポイントの記録はありません"),
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("取得に失敗したら、見本の数字ではなくエラーを出す", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: false, error: "ポイントの集計に失敗しました" },
        500,
      ),
    );

    render(<AppPointsPanel />);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "ポイントの集計に失敗しました",
    );
    expect(screen.queryByRole("group", { name: "付与したポイント" })).toBeNull();
  });

  it("期間を変えると取り直す", async () => {
    render(<AppPointsPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "直近7日" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/admin/api/points/app-stats?from=2026-09-18&to=2026-09-24",
    );
  });
});
