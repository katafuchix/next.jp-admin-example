// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildOverview } from "@/components/features/ads/fixtures";
import { buildMetrics, jsonResponse } from "./fixtures";
import { RevenuePerUserTiles } from "./RevenuePerUserTiles";

const ADS_URL = "/admin/api/ads?from=2026-08-24&to=2026-09-22";
const fetchMock = vi.fn();

function tile(name: string) {
  return within(screen.getByRole("group", { name }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RevenuePerUserTiles", () => {
  it("利用状況と同じ期間の広告データを取り、ARPU・ARPPU・ARPDAU を出す", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: buildOverview({ revenueConnected: true }),
      }),
    );

    // 期間の利用者 120人・延べ 370人・課金中 30人（fixtures）
    render(<RevenuePerUserTiles metrics={buildMetrics()} />);

    expect(fetchMock).toHaveBeenCalledWith(
      ADS_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    // 収益合計 ￥90,000 ÷ 120人
    await waitFor(() => expect(tile("ARPU").getByText("￥750.0")).toBeTruthy());
    expect(tile("ARPU").getByText("収益合計 ÷ 期間の利用者数")).toBeTruthy();
    // 課金の手取り ￥55,000 ÷ 30人
    expect(tile("ARPPU").getByText("￥1,833.3")).toBeTruthy();
    expect(
      tile("ARPPU").getByText("課金の手取り ÷ 課金中の人数（現在）"),
    ).toBeTruthy();
    // 収益合計 ￥90,000 ÷ 延べ 370人
    expect(tile("ARPDAU").getByText("￥243.2")).toBeTruthy();
  });

  it("収益の媒体が未接続なら値の代わりに足りない媒体を出す", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: buildOverview() }),
    );

    render(<RevenuePerUserTiles metrics={buildMetrics()} />);

    await waitFor(() => expect(tile("ARPU").getByText("—")).toBeTruthy());
    expect(
      tile("ARPU").getByText(
        "未接続: Google AdMob・AdGeneration・SmaAD・App Store Connect・Google Play Console",
      ),
    ).toBeTruthy();
    expect(
      tile("ARPPU").getByText("未接続: App Store Connect・Google Play Console"),
    ).toBeTruthy();
    expect(tile("ARPDAU").getByText("—")).toBeTruthy();
  });

  it("広告データが取れなければ、その理由だけを出す", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: false, error: "広告データの取得に失敗しました" },
        500,
      ),
    );

    render(<RevenuePerUserTiles metrics={buildMetrics()} />);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "広告データの取得に失敗しました",
      ),
    );
    expect(screen.queryByRole("group", { name: "ARPU" })).toBeNull();
  });
});
