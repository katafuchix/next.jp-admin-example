// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCompleteRevenue,
  buildPartialRevenue,
} from "@/components/features/revenue/fixtures";
import { jsonResponse } from "@/components/features/user-metrics/fixtures";
import { RevenueTrend } from "./RevenueTrend";

// recharts は jsdom で寸法を測れないので、渡した月の数だけ出す
vi.mock("./RevenueChart", () => ({
  RevenueChart: ({ rows }: { rows: unknown[] }) => (
    <div data-testid="revenue-chart">{rows.length}か月</div>
  ),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  // UTC ではまだ 2026-12-31 だが、JST ではもう 2027-01-01
  vi.useFakeTimers({ now: new Date("2026-12-31T16:00:00Z"), toFake: ["Date"] });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RevenueTrend", () => {
  it("日本時間の今年の月別推移を出す", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: buildCompleteRevenue("2027") }),
    );

    render(<RevenueTrend />);

    expect((await screen.findByTestId("revenue-chart")).textContent).toBe(
      "1か月",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/api/revenue?year=2027",
      expect.anything(),
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("つながっていない媒体があれば、推移が一部だけだと添える", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: buildPartialRevenue("2027") }),
    );

    render(<RevenueTrend />);

    expect((await screen.findByRole("status")).textContent).toContain(
      "まだ取り込めていない媒体（4件）の分は含みません",
    );
    expect(screen.getByRole("link", { name: "収支分析で確認" })).toBeTruthy();
  });

  it("データが無ければグラフの代わりにそう書く", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { ...buildCompleteRevenue("2027"), rows: [] },
      }),
    );

    render(<RevenueTrend />);

    expect(
      await screen.findByText("今年のデータはまだありません"),
    ).toBeTruthy();
    expect(screen.queryByTestId("revenue-chart")).toBeNull();
  });

  it("取れなければ理由を出す", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: false, error: "収益データの取得に失敗しました" },
        500,
      ),
    );

    render(<RevenueTrend />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "収益データの取得に失敗しました",
    );
  });
});
