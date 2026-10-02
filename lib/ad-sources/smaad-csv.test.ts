import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSmaadCsv } from "./smaad-csv";
import { AdSourceError } from "./types";

/**
 * 媒体管理画面の「日別レポート」（発生日・日本時間で表示）からダウンロードした CSV の一部。
 * Shift_JIS・改行 CRLF・新しい日付が上。8月の発生金額の合計 2,470円は管理画面の表示と一致する
 */
const REAL_SAMPLE = new Uint8Array(
  readFileSync(join(__dirname, "fixtures", "smaad-by-day.csv")),
);

const HEADER = "日別,imp,Click,CTR,install,発生CV,CVR,承認数,非承認数,発生金額";

/** Excel などで UTF-8 に保存し直した CSV */
function utf8(lines: string[], bom = true) {
  return new TextEncoder().encode((bom ? "﻿" : "") + lines.join("\r\n"));
}

function parseError(data: Uint8Array): string {
  try {
    parseSmaadCsv(data);
  } catch (err) {
    expect(err).toBeInstanceOf(AdSourceError);
    return (err as Error).message;
  }
  throw new Error("AdSourceError で止まるはずが、読めてしまいました");
}

describe("parseSmaadCsv", () => {
  it("管理画面の日別レポートを、日ごとの収益・表示回数・クリック数・成果件数の行にする", () => {
    expect(parseSmaadCsv(REAL_SAMPLE)).toEqual([
      {
        date: "2026-08-30",
        key: "total",
        label: "全広告枠",
        metrics: { revenue: 770, impressions: 0, clicks: 1, conversions: 1 },
      },
      {
        date: "2026-08-29",
        key: "total",
        label: "全広告枠",
        metrics: { revenue: 160, impressions: 0, clicks: 2, conversions: 1 },
      },
      {
        date: "2026-08-28",
        key: "total",
        label: "全広告枠",
        metrics: { revenue: 0, impressions: 0, clicks: 0, conversions: 0 },
      },
      {
        date: "2026-08-19",
        key: "total",
        label: "全広告枠",
        metrics: { revenue: 1540, impressions: 0, clicks: 3, conversions: 2 },
      },
    ]);
  });

  // install はオファーウォールで紹介した他社アプリのインストール数で、はぴけんのインストール数ではない。
  // installs に入れると Tenjin のインストール数と混ざって CPI が狂う
  it("install の列は取り込まない", () => {
    const rows = parseSmaadCsv(
      utf8([HEADER, "2026/09/01,10,3,30.0,2,1,33.33,1,0,120"]),
    );

    expect(rows[0].metrics).toEqual({
      revenue: 120,
      impressions: 10,
      clicks: 3,
      conversions: 1,
    });
  });

  it("UTF-8 に保存し直した CSV も読める（BOM の有無を問わない）", () => {
    const line = "2026/09/01,10,3,30.0,0,1,33.33,1,0,120";

    for (const bom of [true, false]) {
      expect(parseSmaadCsv(utf8([HEADER, line], bom))).toEqual([
        {
          date: "2026-09-01",
          key: "total",
          label: "全広告枠",
          metrics: { revenue: 120, impressions: 10, clicks: 3, conversions: 1 },
        },
      ]);
    }
  });

  it("列の並びが変わっても、見出しの名前で読む", () => {
    const rows = parseSmaadCsv(
      utf8(["発生金額,Click,日別,発生CV,imp", "120,3,2026/09/01,1,10", ""]),
    );

    expect(rows).toEqual([
      {
        date: "2026-09-01",
        key: "total",
        label: "全広告枠",
        metrics: { revenue: 120, impressions: 10, clicks: 3, conversions: 1 },
      },
    ]);
  });

  it("見出しだけなら行は無い", () => {
    expect(parseSmaadCsv(utf8([HEADER, ""]))).toEqual([]);
  });

  describe("読めない CSV は、画面に出せる理由をつけて止める", () => {
    it("日別レポート以外（月別など）の CSV", () => {
      expect(
        parseError(utf8(["月別,imp,Click,発生CV,発生金額", "2026/09,1,1,0,0"])),
      ).toBe(
        "SmaAD の日別レポートの CSV ではありません（「日別」の列がありません）",
      );
    });

    it("必要な列が欠けている", () => {
      expect(
        parseError(utf8(["日別,imp,Click,発生CV", "2026/09/01,1,1,0"])),
      ).toBe("「発生金額」の列が見つかりません");
    });

    it("空のファイル", () => {
      expect(parseError(new Uint8Array())).toBe(
        "SmaAD の日別レポートの CSV ではありません（「日別」の列がありません）",
      );
    });

    it("日付が読めない行（合計行など）", () => {
      expect(parseError(utf8([HEADER, "合計,0,1,0.0,0,1,0.0,0,0,770"]))).toBe(
        "2行目の日付が読めません（合計）",
      );
    });

    it("数値ではない値", () => {
      expect(
        parseError(
          utf8([
            HEADER,
            "2026/09/02,0,0,0.0,0,0,0.0,0,0,0",
            "2026/09/01,0,1,0.0,0,1,0.0,0,0,",
          ]),
        ),
      ).toBe("3行目の発生金額が数値ではありません（空欄）");
    });

    it("桁区切りの入った値で列がずれた行", () => {
      expect(
        parseError(utf8([HEADER, '2026/09/01,0,1,0.0,0,1,0.0,0,0,"1,540"'])),
      ).toBe("2行目の列の数が見出しと合いません");
    });
  });
});
