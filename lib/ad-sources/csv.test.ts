import { describe, expect, it } from "vitest";
import { readCsvRows } from "./csv";

describe("readCsvRows", () => {
  it("引用符の中のカンマ・改行・二重の引用符をそのまま読む", () => {
    const text =
      'id,title,price\r\n1,"月額, お得",470\r\n2,"2行\n目","3,000"\r\n3,"""限定""",0\r\n';
    expect(readCsvRows(text)).toEqual([
      ["id", "title", "price"],
      ["1", "月額, お得", "470"],
      ["2", "2行\n目", "3,000"],
      ["3", '"限定"', "0"],
    ]);
  });

  it("空の行は飛ばし、空のセルは空文字にする", () => {
    expect(readCsvRows("a,b,c\n\n1,,3\n,,\n")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
      ["", "", ""],
    ]);
  });

  it("最後の行に改行が無くても読む", () => {
    expect(readCsvRows("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("引用符が閉じていなければ失敗する", () => {
    expect(() => readCsvRows('a,b\n1,"2\n')).toThrow("引用符");
  });
});
