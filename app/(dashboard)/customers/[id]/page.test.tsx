// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CustomerDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  customerId: "64b7f0c2a1b2c3d4e5f60001",
  useAppSession: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: mocks.customerId }),
  useRouter: () => ({ push: mocks.push, back: mocks.back }),
}));
vi.mock("@/app/session-context", () => ({
  useAppSession: mocks.useAppSession,
}));

const CUSTOMER = {
  id: mocks.customerId,
  email: "user@example.com",
  name: "山田 花子",
  status: "offline",
  plan: "フリー",
  points: 100,
  totalCharge: null,
  purchaseCount: 0,
  purchasePlatforms: [],
  createdAt: "2026-09-01T00:00:00.000Z",
  lastLoginAt: "",
  loginStreakDays: 0,
  deviceOs: null,
  appVersion: null,
  age: null,
  gender: null,
  height: null,
  residence: null,
  weight: null,
  bmi: null,
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

function stubFetch({
  deleteStatus = 200,
  customer = CUSTOMER as Record<string, unknown>,
} = {}) {
  fetchMock.mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return deleteStatus === 200
          ? jsonResponse({ success: true, data: { id: mocks.customerId } })
          : jsonResponse({ success: false, error: "Forbidden" }, deleteStatus);
      }
      if (String(input).includes("/activity")) {
        return jsonResponse({ success: true, data: [], meta: { total: 0 } });
      }
      return jsonResponse({ success: true, data: customer });
    },
  );
}

function deleteCalls() {
  return fetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
  );
}

async function renderAs(role?: string) {
  mocks.useAppSession.mockReturnValue(role ? { user: { role } } : null);
  render(<CustomerDetailPage />);
  await screen.findByRole("heading", { name: CUSTOMER.name });
}

/** 情報カードの1行（見出しの右隣）に出ている値 */
function rowValue(label: string) {
  return screen.getByText(label).nextElementSibling?.textContent;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  stubFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("顧客詳細画面の「顧客の削除」カード", () => {
  it("SUPER_ADMIN には表示される", async () => {
    await renderAs("SUPER_ADMIN");

    expect(screen.getByRole("heading", { name: "顧客の削除" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "この顧客を削除する" }),
    ).toBeTruthy();
  });

  it.each([
    ["OPERATOR", true],
    ["ANALYST", false],
    ["SUPPORT", false],
    [undefined, false],
  ])(
    "SUPER_ADMIN 以外（%s）には表示されない",
    async (role, canAdjustPoints) => {
      await renderAs(role);

      expect(screen.queryByRole("heading", { name: "顧客の削除" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "この顧客を削除する" }),
      ).toBeNull();
      // ロールが画面に届いていることの確認（ポイント手動変更は WRITE_ROLES で出し分けている）
      expect(
        screen.queryByRole("heading", { name: "ポイント手動変更" }) !== null,
      ).toBe(canAdjustPoints);
    },
  );

  it("確認して削除すると DELETE を送り、顧客一覧へ戻る", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderAs("SUPER_ADMIN");

    fireEvent.click(screen.getByRole("button", { name: "この顧客を削除する" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/customers"));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain(CUSTOMER.email);
    expect(deleteCalls()).toEqual([
      [`/admin/api/customers/${mocks.customerId}`, { method: "DELETE" }],
    ]);
  });

  it("確認ダイアログでキャンセルしたら削除しない", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderAs("SUPER_ADMIN");

    fireEvent.click(screen.getByRole("button", { name: "この顧客を削除する" }));

    expect(deleteCalls()).toHaveLength(0);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("削除に失敗したらエラーを出し、画面に留まる", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    stubFetch({ deleteStatus: 403 });
    await renderAs("SUPER_ADMIN");

    fireEvent.click(screen.getByRole("button", { name: "この顧客を削除する" }));

    expect(await screen.findByText("顧客の削除に失敗しました")).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "この顧客を削除する" }),
    ).toBeTruthy();
  });
});

describe("顧客詳細画面の課金・端末の表示", () => {
  it("記録の無い値は 0 や空欄ではなく「—」で出す", async () => {
    await renderAs("ANALYST");

    expect(rowValue("累計課金額")).toBe("—");
    expect(rowValue("デバイスOS")).toBe("—");
    expect(rowValue("アプリバージョン")).toBe("—");
    expect(
      screen.getByText(/課金額はアプリ側に記録されていないため出せません/),
    ).toBeTruthy();
  });

  it("課金の記録を件数と端末で出す", async () => {
    stubFetch({
      customer: {
        ...CUSTOMER,
        purchaseCount: 3,
        purchasePlatforms: ["ios", "android"],
      },
    });

    await renderAs("ANALYST");

    expect(rowValue("課金の記録")).toBe("3件（iOS・Android）");
  });

  it("課金していなければ「なし」", async () => {
    await renderAs("ANALYST");

    expect(rowValue("課金の記録")).toBe("なし");
  });
});
