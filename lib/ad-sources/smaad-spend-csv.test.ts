import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSmaadSpendCsv } from "./smaad-spend-csv";
import { AdSourceError } from "./types";

/**
 * 広告主の管理画面の「日別レポート」（キャンペーン種別: 通常）からダウンロードした CSV の一部。
 * Shift_JIS・改行 CRLF・古い日付が上。9月1日〜24日の利用金額の合計 338,300円は管理画面の表示と一致する
 */
const REAL_SAMPLE = new Uint8Array(
  readFileSync(join(__dirname, "fixtures", "smaad-spend-by-day.csv")),
);

const HEADER =
  "日付,imp,Click,CTR,install,発生CV,発生CVのうち承認,CVR,承認CV,利用金額";

/** Excel などで UTF-8 に保存し直した CSV */
function utf8(lines: string[], bom = true) {
  return new TextEncoder().encode((bom ? "﻿" : "") + lines.join("\r\n"));
}

function parseError(data: Uint8Array): string {
  try {
    parseSmaadSpendCsv(data);
  } catch (err) {
    expect(err).toBeInstanceOf(AdSourceError);
    return (err as Error).message;
  }
  throw new Error("AdSourceError で止まるはずが、読めてしまいました");
}

describe("parseSmaadSpendCsv", () => {
  // 利用金額は承認CVに付く（多くは1件500円）。9/20 は発生CVが0件でも、前日以前の分の承認で利用金額が出る
  it("広告主の日別レポートを、日ごとの広告費・表示回数・クリック数・成果件数（承認）の行にする", () => {
    expect(parseSmaadSpendCsv(REAL_SAMPLE)).toEqual([
      {
        date: "2026-06-28",
        key: "total",
        label: "全キャンペーン",
        metrics: { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
      },
      {
        date: "2026-09-02",
        key: "total",
        label: "全キャンペーン",
        metrics: {
          spend: 16300,
          impressions: 46,
          clicks: 421,
          conversions: 151,
        },
      },
      {
        date: "2026-09-20",
        key: "total",
        label: "全キャンペーン",
        metrics: { spend: 100, impressions: 92, clicks: 31, conversions: 1 },
      },
      {
        date: "2026-09-25",
        key: "total",
        label: "全キャンペーン",
        metrics: { spend: 500, impressions: 0, clicks: 1, conversions: 1 },
      },
    ]);
  });

  // install は SmaAD の計測によるもので、インストール数は Tenjin から取る。混ぜると CPI が狂う
  it("install の列は取り込まない", () => {
    const rows = parseSmaadSpendCsv(
      utf8([HEADER, "2026/09/01,10,3,30.0,2,1,1,33.33,1,500"]),
    );

    expect(rows[0].metrics).toEqual({
      spend: 500,
      impressions: 10,
      clicks: 3,
      conversions: 1,
    });
  });

  it("UTF-8 に保存し直した CSV も読める（BOM の有無を問わない）", () => {
    const line = "2026/09/01,10,3,30.0,0,2,1,20.0,1,500";

    for (const bom of [true, false]) {
      expect(parseSmaadSpendCsv(utf8([HEADER, line], bom))).toEqual([
        {
          date: "2026-09-01",
          key: "total",
          label: "全キャンペーン",
          metrics: { spend: 500, impressions: 10, clicks: 3, conversions: 1 },
        },
      ]);
    }
  });

  it("列の並びが変わっても、見出しの名前で読む", () => {
    const rows = parseSmaadSpendCsv(
      utf8(["利用金額,Click,日付,承認CV,imp", "500,3,2026/09/01,1,10", ""]),
    );

    expect(rows).toEqual([
      {
        date: "2026-09-01",
        key: "total",
        label: "全キャンペーン",
        metrics: { spend: 500, impressions: 10, clicks: 3, conversions: 1 },
      },
    ]);
  });

  it("見出しだけなら行は無い", () => {
    expect(parseSmaadSpendCsv(utf8([HEADER, ""]))).toEqual([]);
  });

  describe("読めない CSV は、画面に出せる理由をつけて止める", () => {
    // 媒体側（オファーウォール）の CSV を広告出稿のボタンから取り込んでしまったとき
    it("媒体の管理画面の日別レポート", () => {
      expect(
        parseError(
          utf8([
            "日別,imp,Click,CTR,install,発生CV,CVR,承認数,非承認数,発生金額",
            "2026/09/01,0,1,0.0,0,1,0.0,0,0,770",
          ]),
        ),
      ).toBe(
        "SmaAD（広告出稿）の日別レポートの CSV ではありません（「日付」の列がありません）",
      );
    });

    it("必要な列が欠けている", () => {
      expect(
        parseError(utf8(["日付,imp,Click,承認CV", "2026/09/01,1,1,0"])),
      ).toBe("「利用金額」の列が見つかりません");
    });

    it("空のファイル", () => {
      expect(parseError(new Uint8Array())).toBe(
        "SmaAD（広告出稿）の日別レポートの CSV ではありません（「日付」の列がありません）",
      );
    });

    it("日付が読めない行（合計行など）", () => {
      expect(parseError(utf8([HEADER, "合計,0,1,0.0,0,1,1,0.0,1,500"]))).toBe(
        "2行目の日付が読めません（合計）",
      );
    });

    it("数値ではない値", () => {
      expect(
        parseError(
          utf8([
            HEADER,
            "2026/09/01,0,0,0.0,0,0,0,0.0,0,0",
            "2026/09/02,0,1,0.0,0,1,1,0.0,1,",
          ]),
        ),
      ).toBe("3行目の利用金額が数値ではありません（空欄）");
    });

    it("桁区切りの入った値で列がずれた行", () => {
      expect(
        parseError(
          utf8([
            HEADER,
            '2026/09/02,46,421,915.21,0,218,153,51.78,151,"16,300"',
          ]),
        ),
      ).toBe("2行目の列の数が見出しと合いません");
    });
  });
});
