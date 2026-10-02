// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/components/features/user-metrics/fixtures";
import AnalyticsPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// 登録数のパネルは自前で取りに行くので、この画面のテストからは外す
vi.mock("@/components/features/user-metrics/RegistrationPanel", () => ({
  RegistrationPanel: () => null,
}));

function analytics(totalUsers: number) {
  return {
    totalUsers,
    genderDistribution: [],
    ageDistribution: [],
    residenceDistribution: [],
    bmiDistribution: [],
    heightDistribution: [],
    inactiveUsers: { days: 30, count: 0, users: [] },
  };
}

const fetchMock = vi.fn();
const genderSelect = () => screen.getAllByRole("combobox")[0];

beforeEach(() => {
  vi.resetAllMocks();
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const gender = new URL(String(input), "http://localhost").searchParams.get(
      "gender",
    );
    const total = gender === "female" ? 7 : 12;
    return jsonResponse({ success: true, data: analytics(total) });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ユーザー分析", () => {
  it("読み込んだ人数を出す", async () => {
    render(<AnalyticsPage />);

    expect(await screen.findByText("12名")).toBeTruthy();
    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(url.searchParams.get("inactiveDays")).toBe("30");
  });

  it("絞り込みを変えたら取り直し、届くまでは前の条件の数字を出さない", async () => {
    render(<AnalyticsPage />);
    await screen.findByText("12名");
    let resolve!: (res: Response) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((r) => (resolve = r)),
    );

    fireEvent.change(genderSelect(), { target: { value: "female" } });

    expect(screen.queryByText("12名")).toBeNull();
    resolve(jsonResponse({ success: true, data: analytics(7) }));
    expect(await screen.findByText("7名")).toBeTruthy();
  });

  it("取得できなかったら理由を出し、取り直せたら消す", async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ success: false, error: "DB エラー" }, 500),
    );
    render(<AnalyticsPage />);

    expect(
      await screen.findByText("分析データの取得に失敗しました"),
    ).toBeTruthy();

    fireEvent.change(genderSelect(), { target: { value: "female" } });
    expect(await screen.findByText("7名")).toBeTruthy();
    expect(screen.queryByText("分析データの取得に失敗しました")).toBeNull();
  });
});
