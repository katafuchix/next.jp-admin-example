// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMetrics, jsonResponse } from "./fixtures";
import { RegistrationPanel } from "./RegistrationPanel";

const fetchMock = vi.fn();

function card(name: string) {
  return within(screen.getByRole("group", { name }));
}

beforeEach(() => {
  // JST 2026-09-23 10:00
  vi.useFakeTimers({ now: new Date("2026-09-23T01:00:00Z"), toFake: ["Date"] });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    jsonResponse({ success: true, data: buildMetrics() }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RegistrationPanel", () => {
  it("総ユーザー数・新規・総ログイン数を出す", async () => {
    render(<RegistrationPanel />);

    await waitFor(() =>
      expect(card("総ユーザー数").getByText("1,234")).toBeTruthy(),
    );
    expect(card("総ユーザー数").getByText(/9月22日時点/)).toBeTruthy();
    expect(card("新規ユーザー数").getByText("56")).toBeTruthy();
    expect(card("総ログイン数").getByText("370")).toBeTruthy();
    expect(card("総ログイン数").getByText(/利用者 120人/)).toBeTruthy();
  });

  it("退会ユーザー数を、経路の内訳と最初の記録の日つきで出す", async () => {
    render(<RegistrationPanel />);

    await waitFor(() =>
      expect(card("退会ユーザー数").getByText("7")).toBeTruthy(),
    );
    expect(
      card("退会ユーザー数").getByText(
        "アプリ 4・管理画面 3／最初の記録 9月1日",
      ),
    ).toBeTruthy();
  });

  it("退会の記録がまだ無ければ 0 と言い切らず、その旨を出す", async () => {
    const metrics = buildMetrics();
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          ...metrics,
          users: {
            ...metrics.users,
            withdrawals: {
              total: 0,
              fromApp: 0,
              fromAdmin: 0,
              recordedSince: null,
            },
          },
        },
      }),
    );

    render(<RegistrationPanel />);

    await waitFor(() =>
      expect(card("退会ユーザー数").getByText("—")).toBeTruthy(),
    );
    expect(
      card("退会ユーザー数").getByText("まだ退会の記録がありません"),
    ).toBeTruthy();
  });

  it("登録の曜日×時間帯を人数つきで出し、曜日ごとの合計を添える", async () => {
    render(<RegistrationPanel />);

    const table = await screen.findByRole("table", {
      name: /登録した曜日と時間帯/,
    });
    expect(within(table).getByLabelText("月曜 9時台 3人").textContent).toBe(
      "3",
    );
    expect(within(table).getByLabelText("日曜 21時台 5人").textContent).toBe(
      "5",
    );
    expect(within(table).getByLabelText("火曜 0時台 0人").textContent).toBe("");
    expect(within(table).getByLabelText("日曜の合計 5人").textContent).toBe(
      "5",
    );
  });

  it("期間内の登録が0人なら表の代わりにその旨を出す", async () => {
    const metrics = buildMetrics();
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          ...metrics,
          users: {
            ...metrics.users,
            newUsers: 0,
            signupHeatmap: Array.from({ length: 7 }, () =>
              Array<number>(24).fill(0),
            ),
          },
        },
      }),
    );

    render(<RegistrationPanel />);

    await waitFor(() =>
      expect(screen.getByText("期間内の登録はありません")).toBeTruthy(),
    );
    expect(screen.queryByRole("table")).toBeNull();
  });
});
