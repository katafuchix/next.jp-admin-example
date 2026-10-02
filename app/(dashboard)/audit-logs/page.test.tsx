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
import AuditLogsPage from "./page";

function log(resource: string) {
  return {
    _id: resource,
    adminEmail: `${resource.toLowerCase()}@example.com`,
    action: "UPDATE",
    resource,
    createdAt: "2026-09-20T00:00:00Z",
  };
}

const fetchMock = vi.fn();
const queries = () =>
  fetchMock.mock.calls.map(
    ([url]) => new URL(String(url), "http://localhost").searchParams,
  );

beforeEach(() => {
  vi.resetAllMocks();
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const q = new URL(String(input), "http://localhost").searchParams;
    return jsonResponse({
      success: true,
      data: [log(q.get("resource") ?? "Admin")],
      meta: { total: 120, page: Number(q.get("page")), limit: 50 },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("監査ログ", () => {
  it("読み込んだログを出す", async () => {
    render(<AuditLogsPage />);

    expect(await screen.findByText("admin@example.com")).toBeTruthy();
  });

  it("2ページ目でリソースを変えたら、1ページ目から1回だけ取り直す", async () => {
    render(<AuditLogsPage />);
    await screen.findByText("admin@example.com");
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    await waitFor(() =>
      expect(queries().map((q) => q.get("page"))).toContain("2"),
    );
    await screen.findByText("admin@example.com");

    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "Inquiry" },
    });

    expect(screen.queryByText("admin@example.com")).toBeNull();
    expect(await screen.findByText("inquiry@example.com")).toBeTruthy();
    const inquiry = queries().filter((q) => q.get("resource") === "Inquiry");
    expect(inquiry.map((q) => q.get("page"))).toEqual(["1"]);
  });
});
