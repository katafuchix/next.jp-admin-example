// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/components/features/user-metrics/fixtures";
import { ReachSummary } from "./ReachSummary";

const fetchMock = vi.fn();

function card(name: string) {
  return within(screen.getByRole("group", { name }));
}

function reachBody(counts: Record<string, number>) {
  return {
    success: true,
    data: { counts, countedAt: "2026-09-25T01:00:00.000Z" },
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    jsonResponse(
      reachBody({ all: 1234, active: 800, inactive: 434, premium: 56 }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReachSummary", () => {
  it("届く人数を取りに行く", async () => {
    render(<ReachSummary />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/admin/api/notifications/reach");
  });

  it("配信対象ごとに、いま送ると届く人数を出す", async () => {
    render(<ReachSummary />);

    await waitFor(() => expect(card("全体").getByText("1,234名")).toBeTruthy());
    expect(card("アクティブ").getByText("800名")).toBeTruthy();
    expect(card("非アクティブ").getByText("434名")).toBeTruthy();
    expect(card("プレミアム会員").getByText("56名")).toBeTruthy();
    expect(screen.getByText(/9月25日 10:00 時点/)).toBeTruthy();
  });

  it("届く人が1人もいなければ、送っても届かないと書く", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(reachBody({ all: 0, active: 0, inactive: 0, premium: 0 })),
    );

    render(<ReachSummary />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("いま送っても誰にも届きません");
  });

  it("取れなかったら理由を出す", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          success: false,
          error: "APP_MONGODB_URI が未設定のため取得できません",
        },
        503,
      ),
    );

    render(<ReachSummary />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("APP_MONGODB_URI が未設定");
  });
});
