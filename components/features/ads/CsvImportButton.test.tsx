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
import { CsvImportButton } from "./CsvImportButton";

const IMPORT_URL = "/admin/api/ads/import";
const IMPORT_OK = {
  success: true,
  data: {
    source: "smaad",
    label: "SmaAD",
    range: { from: "2026-09-01", to: "2026-09-25" },
    rowCount: 25,
  },
};

const fetchMock = vi.fn();
const onImported = vi.fn();

function csv(name = "report.csv") {
  return new File(["日付,発生金額\n"], name, { type: "text/csv" });
}

function choose(file: File) {
  fireEvent.change(screen.getByLabelText("SmaAD の CSV ファイル"), {
    target: { files: [file] },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse(IMPORT_OK));
  onImported.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CsvImportButton", () => {
  it("ボタンを押すとファイルを選ぶ画面を開く", () => {
    render(
      <CsvImportButton
        source={{ id: "smaad", label: "SmaAD" }}
        onImported={onImported}
      />,
    );
    const input =
      screen.getByLabelText<HTMLInputElement>("SmaAD の CSV ファイル");
    const opened = vi.spyOn(input, "click").mockImplementation(() => {});

    fireEvent.click(
      screen.getByRole("button", { name: "SmaAD の CSV を取り込む" }),
    );

    expect(opened).toHaveBeenCalled();
    expect(input.accept).toBe(".csv,text/csv");
  });

  it("選んだ CSV を媒体IDと一緒に送り、取り込んだ期間を伝えて表を取り直す", async () => {
    render(
      <CsvImportButton
        source={{ id: "smaad", label: "SmaAD" }}
        onImported={onImported}
      />,
    );
    const file = csv();

    choose(file);

    expect(
      await screen.findByText("SmaAD: 9月1日〜9月25日の25行を取り込みました"),
    ).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(onImported).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(IMPORT_URL);
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("source")).toBe("smaad");
    expect(body.get("file")).toBe(file);
  });

  it("送っている間はボタンを押せない", async () => {
    let finish: (res: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (finish = r)));
    render(
      <CsvImportButton
        source={{ id: "smaad", label: "SmaAD" }}
        onImported={onImported}
      />,
    );

    choose(csv());

    const button = await screen.findByRole("button", { name: "取り込み中…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    finish(jsonResponse(IMPORT_OK));
    await waitFor(() => expect(onImported).toHaveBeenCalled());
  });

  it("CSV の形が違えば、サーバーの理由をそのまま出して表は取り直さない", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: false, error: "「発生金額」の列が見つかりません" },
        400,
      ),
    );
    render(
      <CsvImportButton
        source={{ id: "smaad", label: "SmaAD" }}
        onImported={onImported}
      />,
    );

    choose(csv());

    expect((await screen.findByRole("alert")).textContent).toBe(
      "「発生金額」の列が見つかりません",
    );
    expect(onImported).not.toHaveBeenCalled();
  });

  it.each([
    [401, "ログインし直してください"],
    [403, "CSV を取り込む権限がありません"],
    [500, "CSV の取り込みに失敗しました"],
  ])("%i は「%s」", async (status, message) => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false }, status));
    render(
      <CsvImportButton
        source={{ id: "smaad", label: "SmaAD" }}
        onImported={onImported}
      />,
    );

    choose(csv());

    expect((await screen.findByRole("alert")).textContent).toBe(message);
  });

  it("通信が切れたら取り込み失敗と伝える", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <CsvImportButton
        source={{ id: "smaad", label: "SmaAD" }}
        onImported={onImported}
      />,
    );

    choose(csv());

    expect((await screen.findByRole("alert")).textContent).toBe(
      "CSV の取り込みに失敗しました",
    );
  });

  it("512KB を超えるファイルは送らずに断る", async () => {
    render(
      <CsvImportButton
        source={{ id: "smaad", label: "SmaAD" }}
        onImported={onImported}
      />,
    );

    choose(new File(["a".repeat(512 * 1024 + 1)], "big.csv"));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "CSV は 512KB 以下にしてください",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
