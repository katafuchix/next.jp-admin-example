// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/components/features/user-metrics/fixtures";
import NewsletterPage from "./page";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    if (String(input).startsWith("/api/subscribers")) {
      return jsonResponse({ success: true, data: [], meta: { total: 1234 } });
    }
    return jsonResponse({
      success: true,
      data: [
        {
          id: "n1",
          title: "10月のお知らせ",
          subject: "新機能のご案内",
          status: "draft",
          scheduledAt: null,
          recipientCount: 0,
          openRate: null,
          clickRate: null,
        },
      ],
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("メルマガ", () => {
  it("キャンペーンと購読者数を読み込んで出す", async () => {
    render(<NewsletterPage />);

    expect(screen.queryByText("キャンペーンがありません")).toBeNull();
    expect(await screen.findByText("10月のお知らせ")).toBeTruthy();
    expect(await screen.findByText("1,234")).toBeTruthy();
  });

  it("取得できなかったら空の案内を出す", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    render(<NewsletterPage />);

    expect(await screen.findByText("キャンペーンがありません")).toBeTruthy();
  });
});
