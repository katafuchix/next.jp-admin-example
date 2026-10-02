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
import SettingsPage from "./page";

let role = "SUPER_ADMIN";
vi.mock("@/app/session-context", () => ({
  useAppSession: () => ({ user: { role }, expires: "" }),
}));

function admin(name: string) {
  return {
    id: name,
    name,
    email: `${name}@example.com`,
    role: "OPERATOR",
    isActive: true,
    lastLoginAt: null,
  };
}

const fetchMock = vi.fn();
const listCalls = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) =>
      url === "/admin/api/settings/admins" && !(init as RequestInit)?.method,
  );

let listed = [admin("山田")];

beforeEach(() => {
  vi.resetAllMocks();
  role = "SUPER_ADMIN";
  listed = [admin("山田")];
  fetchMock.mockImplementation(async (_: string, init?: RequestInit) => {
    if (init?.method === "POST") return jsonResponse({ success: true });
    return jsonResponse({ success: true, data: listed });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("管理者設定", () => {
  it("システム管理者なら管理者一覧を読み込んで出す", async () => {
    render(<SettingsPage />);

    expect(screen.getByText("読み込み中...")).toBeTruthy();
    expect(await screen.findByText("山田@example.com")).toBeTruthy();
  });

  it("システム管理者でなければ一覧を取りに行かない", () => {
    role = "OPERATOR";
    render(<SettingsPage />);

    expect(
      screen.getByText("この画面はシステム管理者のみアクセスできます。"),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("管理者を追加したら一覧を取り直す", async () => {
    const { container } = render(<SettingsPage />);
    await screen.findByText("山田@example.com");
    fireEvent.click(screen.getByRole("button", { name: "管理者追加" }));
    const input = (type: string) =>
      container.querySelector(`input[type=${type}]`) as HTMLInputElement;
    fireEvent.change(input("text"), { target: { value: "佐藤" } });
    fireEvent.change(input("email"), {
      target: { value: "佐藤@example.com" },
    });
    fireEvent.change(input("password"), { target: { value: "x" } });
    listed = [admin("山田"), admin("佐藤")];

    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(await screen.findByText("佐藤@example.com")).toBeTruthy();
    await waitFor(() => expect(listCalls()).toHaveLength(2));
  });
});
