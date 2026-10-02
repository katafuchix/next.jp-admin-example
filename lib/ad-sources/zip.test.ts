import { describe, expect, it } from "vitest";
import { makeZip } from "./fixtures/make-zip";
import { unzip } from "./zip";

describe("unzip", () => {
  it("deflate で圧縮したファイルと、圧縮していないファイルを取り出す", () => {
    const csv = Buffer.from("a,b\n1,2\n".repeat(50), "utf8");
    const files = unzip(
      makeZip([
        { name: "salesreport_202609.csv", data: csv },
        { name: "readme.txt", data: Buffer.from("はぴけん"), method: 0 },
      ]),
    );

    expect([...files.keys()]).toEqual(["salesreport_202609.csv", "readme.txt"]);
    expect(files.get("salesreport_202609.csv")?.equals(csv)).toBe(true);
    expect(files.get("readme.txt")?.toString("utf8")).toBe("はぴけん");
  });

  it("ZIP でなければ失敗する", () => {
    expect(() => unzip(Buffer.from("<html>Not Found</html>"))).toThrow("ZIP");
  });

  it("途中で切れた ZIP は失敗する", () => {
    const zip = makeZip([
      { name: "a.csv", data: Buffer.from("x".repeat(500)) },
    ]);
    const broken = Buffer.concat([zip.subarray(0, 40), zip.subarray(-22)]);
    expect(() => unzip(broken)).toThrow();
  });

  it("対応していない圧縮方式は失敗する", () => {
    const zip = makeZip([{ name: "a.csv", data: Buffer.from("x"), method: 0 }]);
    // 中央ディレクトリの圧縮方式を 12（bzip2）に書き換える
    const at = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    zip.writeUInt16LE(12, at + 10);
    expect(() => unzip(zip)).toThrow("圧縮方式");
  });
});
