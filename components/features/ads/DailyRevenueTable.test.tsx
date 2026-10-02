// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DailyRevenue } from "@/lib/ad-sources/overview";
import type { AdSourceId } from "@/lib/ad-sources/types";
import { DailyRevenueTable } from "./DailyRevenueTable";

const LABELS = new Map<AdSourceId, string>([
  ["admob", "Google AdMob"],
  ["adgeneration", "AdGeneration"],
  ["smaad", "SmaAD"],
]);

const DAILY: DailyRevenue = {
  sources: ["admob", "smaad"],
  missing: ["adgeneration"],
  rows: [
    { date: "2026-09-22", values: [1_200, 300], total: 1_500 },
    { date: "2026-09-21", values: [null, null], total: null },
    { date: "2026-09-20", values: [800, null], total: 800 },
  ],
  totals: { values: [2_000, 300], total: 2_300 },
};

function cells(row: HTMLElement) {
  return Array.from(row.querySelectorAll("th, td"), (c) => c.textContent);
}

afterEach(cleanup);

describe("DailyRevenueTable", () => {
  it("つながった媒体を列にして、新しい日から並べ、期間の合計を最後に出す", () => {
    render(<DailyRevenueTable daily={DAILY} labels={LABELS} />);

    const rows = screen.getAllByRole("row");
    expect(rows.map(cells)).toEqual([
      ["日付", "Google AdMob", "SmaAD", "合計"],
      ["9/22（火）", "￥1,200", "￥300", "￥1,500"],
      ["9/21（月）", "—", "—", "—"],
      ["9/20（日）", "￥800", "—", "￥800"],
      ["期間の合計", "￥2,000", "￥300", "￥2,300"],
    ]);
    expect(
      screen.getByText("未接続: AdGeneration（この表には含みません）"),
    ).toBeTruthy();
  });

  it("スクロールする表はキーボードでも動かせるよう、名前つきの領域にする", () => {
    render(<DailyRevenueTable daily={DAILY} labels={LABELS} />);

    const region = screen.getByRole("region", { name: "日別の広告収益の表" });
    expect(region.getAttribute("tabindex")).toBe("0");
  });

  it("全部つながっていれば未接続の注記は出さない", () => {
    render(
      <DailyRevenueTable daily={{ ...DAILY, missing: [] }} labels={LABELS} />,
    );

    expect(screen.queryByText(/未接続/)).toBe(null);
  });

  it("広告収益の媒体が1つもつながっていなければ、表の代わりに理由を書く", () => {
    render(
      <DailyRevenueTable
        daily={{
          sources: [],
          missing: ["admob", "adgeneration", "smaad"],
          rows: DAILY.rows.map((r) => ({ ...r, values: [], total: null })),
          totals: { values: [], total: null },
        }}
        labels={LABELS}
      />,
    );

    expect(screen.queryByRole("table")).toBe(null);
    expect(
      screen.getByText(
        "広告収益の媒体（Google AdMob・AdGeneration・SmaAD）がまだつながっていません。同期すると日ごとの収益が出ます。",
      ),
    ).toBeTruthy();
  });
});
