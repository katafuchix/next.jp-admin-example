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
import { buildOverview } from "@/components/features/ads/fixtures";
import { ActivityPanel } from "./ActivityPanel";
import { buildMetrics, jsonResponse } from "./fixtures";

// recharts は jsdom で寸法を測れないので、渡したデータの件数だけ出す
vi.mock("./DauChart", () => ({
  DauChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="dau-chart">{data.length}</div>
  ),
}));

const fetchMock = vi.fn();
const METRICS_URL = "/admin/api/user-metrics";

/** ARPU などのために広告データも取るので、利用状況の取得だけを数える */
function metricsCalls() {
  return fetchMock.mock.calls.filter(([url]) =>
    String(url).startsWith(METRICS_URL),
  );
}

function card(name: string) {
  return within(screen.getByRole("group", { name }));
}

beforeEach(() => {
  // JST 2026-09-23 10:00
  vi.useFakeTimers({ now: new Date("2026-09-23T01:00:00Z"), toFake: ["Date"] });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) =>
    jsonResponse({
      success: true,
      data: url.startsWith(METRICS_URL)
        ? buildMetrics()
        : buildOverview({ revenueConnected: true }),
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ActivityPanel", () => {
  it("昨日までの30日間で取得し、DAU・WAU・MAU・課金率を出す", async () => {
    render(<ActivityPanel />);

    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/api/user-metrics?from=2026-08-24&to=2026-09-22",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await waitFor(() => expect(card("平均DAU").getByText("12.3")).toBeTruthy());
    expect(card("WAU").getByText("40")).toBeTruthy();
    expect(card("MAU").getByText("95")).toBeTruthy();
    expect(card("課金率（現在）").getByText("2.4%")).toBeTruthy();
    expect(
      card("課金率（現在）").getByText(/期間内の登録者では 3\.6%/),
    ).toBeTruthy();
    expect(screen.getByTestId("dau-chart").textContent).toBe("2");
  });

  it("同じ期間の広告データを取り、ARPU・ARPPU・ARPDAU を並べる", async () => {
    render(<ActivityPanel />);

    await waitFor(() => expect(card("ARPU").getByText("￥750.0")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/api/ads?from=2026-08-24&to=2026-09-22",
      expect.anything(),
    );
    expect(card("ARPPU").getByText("￥1,833.3")).toBeTruthy();
    expect(card("ARPDAU").getByText("￥243.2")).toBeTruthy();
  });

  it("継続率は割合と母数を出し、判定できる人がいない日は — にする", async () => {
    render(<ActivityPanel />);

    await waitFor(() =>
      expect(card("翌日の継続率").getByText("40.0%")).toBeTruthy(),
    );
    expect(card("翌日の継続率").getByText("50人中20人")).toBeTruthy();
    expect(card("7日後の継続率").getByText("20.0%")).toBeTruthy();
    expect(card("30日後の継続率").getByText("—")).toBeTruthy();
  });

  it("「直近7日」を押すとその期間で取り直す", async () => {
    render(<ActivityPanel />);
    await waitFor(() => expect(card("WAU").getByText("40")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "直近7日" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/admin/api/user-metrics?from=2026-09-16&to=2026-09-22",
        expect.anything(),
      ),
    );
    expect(
      screen
        .getByRole("button", { name: "直近7日" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("開始日が終了日より後なら取りに行かずに理由を出す", async () => {
    render(<ActivityPanel />);
    await waitFor(() => expect(metricsCalls()).toHaveLength(1));

    fireEvent.change(screen.getByLabelText("開始日"), {
      target: { value: "2026-09-30" },
    });

    expect(screen.getByRole("alert").textContent).toContain(
      "開始日は終了日以前にしてください",
    );
    expect(metricsCalls()).toHaveLength(1);
  });

  it("取得に失敗したらサーバーの理由を出す", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: false, error: "期間は366日以内で指定してください" },
        400,
      ),
    );

    render(<ActivityPanel />);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "期間は366日以内で指定してください",
      ),
    );
  });

  it("通信そのものが失敗したら一般的な文言を出す", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<ActivityPanel />);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "ユーザー指標の取得に失敗しました",
      ),
    );
  });
});
