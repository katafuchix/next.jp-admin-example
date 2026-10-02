import { describe, expect, it } from "vitest";
import { AD_SOURCES } from "@/lib/ad-sources/registry";
import { buildOverview } from "./fixtures";
import { groupSources } from "./source-groups";

const summary = (groups: ReturnType<typeof groupSources>) =>
  groups.map((g) => [g.label, g.sources.map((s) => s.id)]);

describe("groupSources", () => {
  it("媒体を用途ごとにまとめ、用途の中では媒体一覧の順に並べる", () => {
    expect(summary(groupSources(buildOverview().sources))).toEqual([
      ["広告費・インストール", ["tenjin", "smaad_spend"]],
      ["広告収益", ["admob", "adgeneration", "smaad"]],
      ["アプリ内課金", ["appstore", "googleplay"]],
    ]);
  });

  it("媒体が1つも無い用途は出さない", () => {
    const sources = buildOverview().sources.filter((s) =>
      ["admob", "appstore"].includes(s.id),
    );
    expect(summary(groupSources(sources))).toEqual([
      ["広告収益", ["admob"]],
      ["アプリ内課金", ["appstore"]],
    ]);
  });

  it("どの用途にも入らずに消える媒体が無い", () => {
    const grouped = groupSources(buildOverview().sources).flatMap(
      (g) => g.sources,
    );
    expect(grouped).toHaveLength(AD_SOURCES.length);
  });
});
