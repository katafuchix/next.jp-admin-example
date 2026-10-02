// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/components/features/user-metrics/fixtures";
import PointsPage from "./page";

// アプリのポイント集計は自前で取りに行くので、この画面のテストからは外す
vi.mock("@/components/features/points/AppPointsPanel", () => ({
  AppPointsPanel: () => null,
}));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  fetchMock.mockImplementation(async () =>
    jsonResponse({
      success: true,
      data: [
        {
          id: "r1",
          name: "ログインボーナス",
          type: "bonus",
          points: 10,
          condition: "1日1回",
          isActive: true,
          updatedAt: "2026-09-20",
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ポイントルール", () => {
  it("読み込んだルールを出す", async () => {
    render(<PointsPage />);

    expect(screen.queryByText("ルールがありません")).toBeNull();
    expect(await screen.findByText("ログインボーナス")).toBeTruthy();
  });

  it("取得できなかったら空の案内を出す", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<PointsPage />);

    expect(await screen.findByText("ルールがありません")).toBeTruthy();
  });
});
