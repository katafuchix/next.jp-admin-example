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
import { jsonResponse } from "@/components/features/user-metrics/fixtures";
import type { AdOverview } from "@/lib/ad-sources/overview";
import type { AdSourceId } from "@/lib/ad-sources/types";
import { AdOverviewPanel } from "./AdOverviewPanel";
import { buildOverview } from "./fixtures";

const OVERVIEW_URL = "/admin/api/ads?from=2026-08-24&to=2026-09-22";
const SYNC_URL = "/admin/api/ads/sync";
const IMPORT_URL = "/admin/api/ads/import";

const fetchMock = vi.fn();
let overview = buildOverview();
const SYNC_OK = {
  success: true,
  data: {
    range: { from: "2026-09-16", to: "2026-09-22" },
    results: [
      {
        source: "tenjin",
        label: "Tenjin",
        status: "success",
        rowCount: 7,
        message: null,
      },
      {
        source: "admob",
        label: "Google AdMob",
        status: "failed",
        rowCount: 0,
        message: "x",
      },
      {
        source: "smaad",
        label: "SmaAD",
        status: "skipped",
        rowCount: 0,
        message: "y",
      },
    ],
  },
};
let syncResponse = jsonResponse(SYNC_OK);
const IMPORT_OK = {
  success: true,
  data: {
    source: "smaad",
    label: "SmaAD",
    range: { from: "2026-09-01", to: "2026-09-22" },
    rowCount: 22,
  },
};

/** CSV で取り込む媒体を ids だけにする（媒体一覧の実装に左右されないように） */
function withCsvImport(o: AdOverview, ids: AdSourceId[]): AdOverview {
  return {
    ...o,
    sources: o.sources.map((s) => ({ ...s, csvImport: ids.includes(s.id) })),
  };
}

function tile(name: string) {
  return within(screen.getByRole("group", { name }));
}

function row(name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return within(screen.getByRole("row", { name: new RegExp(`^${escaped}`) }));
}

/** 用途ごとのまとまり（広告収益・アプリ内課金など）。見出しの行から tbody をたどる */
function group(name: string) {
  const heading = screen.getByRole("rowheader", { name });
  const body = heading.closest("tbody");
  if (!body) throw new Error(`${name} のまとまりがありません`);
  return within(body);
}

function overviewCalls() {
  return fetchMock.mock.calls.filter(
    ([url]) => url !== SYNC_URL && url !== IMPORT_URL,
  );
}

beforeEach(() => {
  // JST 2026-09-23 10:00
  vi.useFakeTimers({ now: new Date("2026-09-23T01:00:00Z"), toFake: ["Date"] });
  overview = buildOverview();
  syncResponse = jsonResponse(SYNC_OK);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) =>
    url === SYNC_URL
      ? syncResponse
      : url === IMPORT_URL
        ? jsonResponse(IMPORT_OK)
        : jsonResponse({ success: true, data: overview }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AdOverviewPanel", () => {
  it("昨日までの30日間で取得し、何もつながっていなければ値を出さずに理由を書く", async () => {
    render(<AdOverviewPanel canSync={false} />);

    expect(fetchMock).toHaveBeenCalledWith(
      OVERVIEW_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await waitFor(() => expect(tile("広告費").getByText("—")).toBeTruthy());
    expect(tile("広告費").getByText("未接続: SmaAD（広告出稿）")).toBeTruthy();
    expect(
      tile("広告収益").getByText("未接続: Google AdMob・AdGeneration・SmaAD"),
    ).toBeTruthy();
    expect(
      screen.getByText(/まだどの媒体からも取り込めていません/),
    ).toBeTruthy();
    expect(row("Tenjin").getByText("未接続")).toBeTruthy();
    expect(row("Tenjin").getByText("認証情報が未設定です")).toBeTruthy();
    // 見出し・用途3つ・媒体7つ
    expect(screen.getAllByRole("row")).toHaveLength(11);
  });

  it("取り込めた媒体の分は数字を出し、率は必要な媒体がそろうまで出さない", async () => {
    overview = buildOverview({ connected: true, spendConnected: true });

    render(<AdOverviewPanel canSync={false} />);

    await waitFor(() =>
      expect(tile("広告費").getByText("￥90,000")).toBeTruthy(),
    );
    expect(tile("インストール数").getByText("300")).toBeTruthy();
    expect(tile("CPI").getByText("￥300")).toBeTruthy();
    expect(tile("CPI").getByText("広告費 ÷ インストール数")).toBeTruthy();
    expect(tile("ROAS").getByText("—")).toBeTruthy();
    expect(tile("ROAS").getByText(/^未接続: Google AdMob・/)).toBeTruthy();
    expect(screen.queryByText(/まだどの媒体からも取り込めていません/)).toBe(
      null,
    );

    expect(row("Tenjin").getByText("正常")).toBeTruthy();
    expect(row("Tenjin").getByText("インストール")).toBeTruthy();
    expect(row("Tenjin").getByText("300件")).toBeTruthy();
    expect(row("Tenjin").getByText("9月23日 9:30（自動）")).toBeTruthy();
    expect(row("SmaAD（広告出稿）").getByText("￥90,000")).toBeTruthy();
    expect(row("SmaAD（広告出稿）").getByText("成果 280件")).toBeTruthy();
    expect(
      row("SmaAD（広告出稿）").getByText("9月23日 9:30（CSV）"),
    ).toBeTruthy();
    expect(row("Google AdMob").getByText("失敗")).toBeTruthy();
    expect(
      row("Google AdMob").getByText("AdMob の認証が切れています"),
    ).toBeTruthy();
    expect(row("Google AdMob").getByText("9月23日 9:30（手動）")).toBeTruthy();
  });

  it("媒体を用途ごとにまとめ、用途の見出しの下に並べる", async () => {
    render(<AdOverviewPanel canSync={false} />);
    await waitFor(() => expect(tile("広告費").getByText("—")).toBeTruthy());

    const names = (name: string) =>
      group(name)
        .getAllByRole("row")
        .slice(1)
        .map((r) => within(r).getByRole("rowheader").textContent);
    expect(names("広告費・インストール")).toEqual([
      expect.stringMatching(/^Tenjin/),
      expect.stringMatching(/^SmaAD（広告出稿）/),
    ]);
    expect(names("広告収益")).toEqual([
      expect.stringMatching(/^Google AdMob/),
      expect.stringMatching(/^AdGeneration/),
      expect.stringMatching(/^SmaAD(?!（)/),
    ]);
    expect(names("アプリ内課金")).toEqual([
      expect.stringMatching(/^App Store Connect/),
      expect.stringMatching(/^Google Play Console/),
    ]);
  });

  it("広告費の CSV をまだ取り込んでいなければ、インストール数だけ出し、広告費・CPI は ￥0 と出さない", async () => {
    overview = buildOverview({ connected: true });

    render(<AdOverviewPanel canSync={false} />);

    await waitFor(() =>
      expect(tile("インストール数").getByText("300")).toBeTruthy(),
    );
    expect(tile("広告費").getByText("—")).toBeTruthy();
    expect(tile("広告費").getByText("未接続: SmaAD（広告出稿）")).toBeTruthy();
    expect(tile("CPI").getByText("—")).toBeTruthy();
    expect(tile("CPI").getByText("未接続: SmaAD（広告出稿）")).toBeTruthy();
    expect(row("SmaAD（広告出稿）").getByText("取り込み待ち")).toBeTruthy();
  });

  it("広告収益の媒体を取り込んでいれば、日別・媒体別の収益を新しい日から並べる", async () => {
    overview = buildOverview({
      revenueConnected: true,
      dailyRevenue: [
        { source: "admob", date: "2026-09-22", value: 1_200 },
        { source: "adgeneration", date: "2026-09-22", value: 400 },
        { source: "smaad", date: "2026-09-21", value: 300 },
      ],
    });

    render(<AdOverviewPanel canSync={false} />);

    const section = await screen.findByRole("region", {
      name: "日別の広告収益",
    });
    const table = within(section).getByRole("table");
    const rows = within(table).getAllByRole("row");
    // 見出し・30日分・期間の合計
    expect(rows).toHaveLength(32);
    expect(rows[1].textContent).toBe("9/22（火）￥1,200￥400—￥1,600");
    expect(rows[2].textContent).toBe("9/21（月）——￥300￥300");
    expect(rows[31].textContent).toBe("期間の合計￥1,200￥400￥300￥1,900");
  });

  it("広告収益の媒体がつながっていなければ、日別の欄には理由だけを書く", async () => {
    render(<AdOverviewPanel canSync={false} />);

    const section = await screen.findByRole("region", {
      name: "日別の広告収益",
    });
    await waitFor(() =>
      expect(
        within(section).getByText(/広告収益の媒体（Google AdMob・AdGeneration・SmaAD）がまだつながっていません/),
      ).toBeTruthy(),
    );
    expect(within(section).queryByRole("table")).toBe(null);
  });

  it("期間を変えるとその期間で取り直す", async () => {
    render(<AdOverviewPanel canSync={false} />);
    await waitFor(() => expect(tile("広告費").getByText("—")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "直近7日" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/admin/api/ads?from=2026-09-16&to=2026-09-22",
        expect.anything(),
      ),
    );
  });

  it("取得に失敗したらサーバーの理由を出す", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: false, error: "広告データの取得に失敗しました" },
        500,
      ),
    );

    render(<AdOverviewPanel canSync={false} />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "広告データの取得に失敗しました",
    );
  });

  it("書き込み権限が無ければ同期ボタンを出さない", async () => {
    render(<AdOverviewPanel canSync={false} />);
    await waitFor(() => expect(tile("広告費").getByText("—")).toBeTruthy());

    expect(screen.queryByRole("button", { name: /今すぐ同期/ })).toBe(null);
  });

  it("同期ボタンで取り込み、結果を出してから画面を取り直す", async () => {
    render(<AdOverviewPanel canSync />);
    await waitFor(() => expect(tile("広告費").getByText("—")).toBeTruthy());
    expect(overviewCalls()).toHaveLength(1);

    fireEvent.click(
      screen.getByRole("button", { name: "今すぐ同期（直近7日）" }),
    );

    expect((await screen.findByRole("status")).textContent).toContain(
      "同期しました（成功 1・失敗 1・未取得 1）",
    );
    expect(fetchMock).toHaveBeenCalledWith(SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    await waitFor(() => expect(overviewCalls()).toHaveLength(2));
    expect(overviewCalls()[1][0]).toBe(OVERVIEW_URL);
  });

  it.each([
    [403, { success: false, error: "Forbidden" }, "同期する権限がありません"],
    [
      401,
      { success: false, error: "Unauthorized" },
      "ログインし直してください",
    ],
    [
      500,
      { success: false, error: "広告データの同期に失敗しました" },
      "広告データの同期に失敗しました",
    ],
  ])(
    "同期が %i で返ったら理由を出し、画面は取り直さない",
    async (status, body, message) => {
      syncResponse = jsonResponse(body, status);
      render(<AdOverviewPanel canSync />);
      await waitFor(() => expect(tile("広告費").getByText("—")).toBeTruthy());

      fireEvent.click(
        screen.getByRole("button", { name: "今すぐ同期（直近7日）" }),
      );

      expect((await screen.findByRole("alert")).textContent).toContain(message);
      expect(overviewCalls()).toHaveLength(1);
    },
  );

  it("CSV で取り込む媒体には、その媒体の行に取り込みボタンを出し、取り込んだら画面を取り直す", async () => {
    overview = withCsvImport(buildOverview(), ["smaad"]);
    render(<AdOverviewPanel canSync />);
    await waitFor(() => expect(overviewCalls()).toHaveLength(1));

    expect(
      group("広告収益").getByRole("button", { name: "SmaAD の CSV を取り込む" }),
    ).toBeTruthy();
    fireEvent.change(await screen.findByLabelText("SmaAD の CSV ファイル"), {
      target: { files: [new File(["x"], "smaad.csv", { type: "text/csv" })] },
    });

    expect(
      await screen.findByText("SmaAD: 9月1日〜9月22日の22行を取り込みました"),
    ).toBeTruthy();
    await waitFor(() => expect(overviewCalls()).toHaveLength(2));
    expect(overviewCalls()[1][0]).toBe(OVERVIEW_URL);
    // 取り直しのあとも、取り込んだ結果は消えない
    await waitFor(() => expect(tile("広告費").getByText("—")).toBeTruthy());
    expect(
      screen.getByText("SmaAD: 9月1日〜9月22日の22行を取り込みました"),
    ).toBeTruthy();
  });

  it("CSV で取り込む媒体が無ければ取り込みボタンを出さない", async () => {
    overview = withCsvImport(buildOverview(), []);
    render(<AdOverviewPanel canSync />);
    await screen.findByRole("button", { name: "今すぐ同期（直近7日）" });
    await waitFor(() => expect(tile("広告費").getByText("—")).toBeTruthy());

    expect(screen.queryByRole("button", { name: /CSV を取り込む/ })).toBe(null);
  });

  it("書き込み権限が無ければ CSV の取り込みボタンも出さない", async () => {
    overview = withCsvImport(buildOverview(), ["smaad"]);
    render(<AdOverviewPanel canSync={false} />);
    await waitFor(() => expect(tile("広告費").getByText("—")).toBeTruthy());

    expect(screen.queryByRole("button", { name: /CSV を取り込む/ })).toBe(null);
  });
});
