// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GenderRatioChart } from "./GenderRatioChart";

afterEach(() => {
  cleanup();
});

function breakdown() {
  return within(screen.getByRole("list", { name: "男女比率の内訳" }));
}

describe("男女比率のグラフ", () => {
  it("人数と割合を凡例に並べる（円の外に描くと領域からはみ出して切れるため）", () => {
    render(
      <GenderRatioChart
        items={[
          { gender: "male", label: "男性", count: 2309 },
          { gender: "female", label: "女性", count: 1234 },
        ]}
      />,
    );

    const rows = breakdown().getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "男性2,309名（65.2%）",
      "女性1,234名（34.8%）",
    ]);
  });

  it("0名の区分は凡例に出さない", () => {
    render(
      <GenderRatioChart
        items={[
          { gender: "male", label: "男性", count: 10 },
          { gender: "female", label: "女性", count: 0 },
          { gender: "unknown", label: "未回答", count: 0 },
        ]}
      />,
    );

    const rows = breakdown().getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["男性10名（100%）"]);
  });
});
