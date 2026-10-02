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
import {
  buildCompleteRevenue,
  buildPartialRevenue,
} from "@/components/features/revenue/fixtures";
import { jsonResponse } from "@/components/features/user-metrics/fixtures";
import RevenuePage from "./page";

// recharts は jsdom で寸法を測れないので、渡した月の数だけ出す
vi.mock("@/components/features/dashboard/RevenueChart", () => ({
  RevenueChart: ({ rows }: { rows: unknown[] }) => (
    <div data-testid="revenue-chart">{rows.length}か月</div>
  ),
}));

const fetchMock = vi.fn();

function tile(name: string) {
  return within(screen.getByRole("group", { name }));
}

function row(name: string) {
  return within(screen.getByRole("row", { name: new RegExp(`^${name}`) }));
}

beforeEach(() => {
  // JST 2026-09-23 10:00
  vi.useFakeTimers({ now: new Date("2026-09-23T01:00:00Z"), toFake: ["Date"] });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const year = new URL(url, "http://localhost").searchParams.get("year");
    return jsonResponse({ success: true, data: buildPartialRevenue(year!) });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("収支分析", () => {
  it("日本時間の今年を取り、年の合計を出す。つながっていない種類は「—」", async () => {
    render(<RevenuePage />);

    await screen.findByRole("group", { name: "広告収益" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/api/revenue?year=2026",
      expect.anything(),
    );
    expect(tile("課金の手取り").getByText("—")).toBeTruthy();
    expect(tile("広告収益").getByText("￥8,000")).toBeTruthy();
    expect(tile("広告費").getByText("￥60,000")).toBeTruthy();
    expect(tile("粗利").getByText("—")).toBeTruthy();
    expect(screen.getByTestId("revenue-chart").textContent).toBe("2か月");
  });

  it("まだつながっていない媒体を名前で案内し、粗利を出さない理由を書く", async () => {
    render(<RevenuePage />);

    const notice = within(await screen.findByRole("status"));
    expect(
      notice.getByText(/課金の手取り.*App Store Connect、Google Play Console/),
    ).toBeTruthy();
    expect(notice.getByText(/広告収益.*AdGeneration、SmaAD/)).toBeTruthy();
    expect(notice.queryByText(/広告費/)).toBeNull();
    expect(notice.getByText(/粗利は6媒体すべてがつながってから/)).toBeTruthy();
  });

  it("月ごとの行と合計行を出す。列は「原価」ではなく「広告費」", async () => {
    render(<RevenuePage />);

    await screen.findByRole("row", { name: /^9月/ });
    expect(screen.getByRole("columnheader", { name: "広告費" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "原価" })).toBeNull();
    expect(
      row("9月").getByText("￥5,000", { selector: "td:nth-child(3)" }),
    ).toBeTruthy();
    expect(row("9月").getByText("￥20,000")).toBeTruthy();
    expect(row("合計").getByText("￥60,000")).toBeTruthy();
    expect(row("合計").getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText(/サーバー代・人件費などは含みません/)).toBeTruthy();
  });

  it("全媒体がつながっていれば粗利と粗利率を出し、案内は出さない", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: buildCompleteRevenue() }),
    );

    render(<RevenuePage />);

    await waitFor(() =>
      expect(tile("粗利").getByText("￥30,000")).toBeTruthy(),
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(row("9月").getByText("60.0%")).toBeTruthy();
  });

  it("年を変えるとその年を取り直す", async () => {
    render(<RevenuePage />);
    await screen.findByRole("group", { name: "広告収益" });

    fireEvent.change(screen.getByRole("combobox", { name: "対象の年" }), {
      target: { value: "2025" },
    });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/admin/api/revenue?year=2025",
        expect.anything(),
      ),
    );
    expect(
      screen.getByRole("link", { name: /エクスポート/ }).getAttribute("href"),
    ).toBe("/admin/api/export?type=revenue&year=2025");
  });

  it("取れなければ理由を出し、0円の表にしない", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: false, error: "収益データの取得に失敗しました" },
        500,
      ),
    );

    render(<RevenuePage />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "収益データの取得に失敗しました",
    );
    expect(screen.queryByText("￥0")).toBeNull();
  });
});
