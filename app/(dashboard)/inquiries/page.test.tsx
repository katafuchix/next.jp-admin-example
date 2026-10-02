// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/components/features/user-metrics/fixtures";
import InquiriesPage from "./page";

function inquiry(subject: string, status = "open") {
  return {
    id: subject,
    ticketId: `T-${subject}`,
    userEmail: "user@example.com",
    subject,
    category: "その他",
    priority: "medium",
    status,
    body: "本文",
    createdAt: "2026-09-20",
  };
}

const fetchMock = vi.fn();
const listCalls = () =>
  fetchMock.mock.calls.filter(([url]) =>
    String(url).startsWith("/admin/api/inquiries?"),
  );

let listed = [inquiry("ログインできない")];

beforeEach(() => {
  vi.resetAllMocks();
  listed = [inquiry("ログインできない")];
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/reply")) return jsonResponse({ success: true });
    return jsonResponse({ success: true, data: listed });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("問い合わせ一覧", () => {
  it("読み込んだ問い合わせを出す", async () => {
    render(<InquiriesPage />);

    expect(screen.getByText("読み込み中...")).toBeTruthy();
    expect(await screen.findByText("ログインできない")).toBeTruthy();
  });

  it("返信を送ったら一覧を取り直す", async () => {
    render(<InquiriesPage />);
    await screen.findByText("ログインできない");
    fireEvent.click(screen.getByRole("button", { name: "返信" }));
    fireEvent.change(screen.getByPlaceholderText("返信内容を入力..."), {
      target: { value: "確認します" },
    });
    listed = [inquiry("ログインできない", "in_progress")];

    fireEvent.click(screen.getByRole("button", { name: "送信" }));

    // 「対応中」は絞り込みタブにもあるので、行のバッジが増えたことで確かめる
    await waitFor(() => expect(screen.getAllByText("対応中")).toHaveLength(2));
    expect(listCalls()).toHaveLength(2);
  });
});
