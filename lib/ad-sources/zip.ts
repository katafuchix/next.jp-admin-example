import { inflateRawSync } from "node:zlib";

/**
 * ZIP の中のファイルを全部取り出す。
 * Google Play のレポート（数KB〜数MBの CSV が1つ入った zip）を読めれば足りるので、
 * 無圧縮と deflate だけに対応し、ZIP64・暗号化・分割は扱わない（見つけたら失敗する）。
 * 各ファイルの大きさは中央ディレクトリから読む（ローカルヘッダーは後置きのとき 0 になるため）。
 */

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;
const END_SIZE = 22;
/** 末尾のコメントは最大 65535 バイト。その先まで終端レコードを探さない */
const MAX_COMMENT = 0xffff;

function findEnd(zip: Buffer): number {
  const last = zip.length - END_SIZE;
  for (let at = last; at >= 0 && at >= last - MAX_COMMENT; at--) {
    if (zip.readUInt32LE(at) === END_SIG) return at;
  }
  throw new Error("ZIP ではありません（終端レコードがありません）");
}

function extract(
  zip: Buffer,
  name: string,
  method: number,
  compressedSize: number,
  size: number,
  localAt: number,
): Buffer {
  if (localAt + 30 > zip.length || zip.readUInt32LE(localAt) !== LOCAL_SIG) {
    throw new Error(`ZIP の ${name} の位置が壊れています`);
  }
  const start =
    localAt +
    30 +
    zip.readUInt16LE(localAt + 26) +
    zip.readUInt16LE(localAt + 28);
  if (start + compressedSize > zip.length) {
    throw new Error(`ZIP の ${name} が途中で切れています`);
  }
  const body = zip.subarray(start, start + compressedSize);
  const data =
    method === 0
      ? Buffer.from(body)
      : method === 8
        ? inflateRawSync(body)
        : null;
  if (data === null) {
    throw new Error(`ZIP の ${name} は対応していない圧縮方式（${method}）です`);
  }
  if (data.length !== size) {
    throw new Error(`ZIP の ${name} を展開した大きさが記録と違います`);
  }
  return data;
}

export function unzip(zip: Buffer): Map<string, Buffer> {
  if (zip.length < END_SIZE) {
    throw new Error("ZIP ではありません（短すぎます）");
  }
  const end = findEnd(zip);
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);

  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (at + 46 > zip.length || zip.readUInt32LE(at) !== CENTRAL_SIG) {
      throw new Error("ZIP の中央ディレクトリが壊れています");
    }
    const flags = zip.readUInt16LE(at + 8);
    const method = zip.readUInt16LE(at + 10);
    const compressedSize = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const next =
      at +
      46 +
      nameLength +
      zip.readUInt16LE(at + 30) +
      zip.readUInt16LE(at + 32);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString("utf8");

    if (flags & 0x1) throw new Error(`ZIP の ${name} は暗号化されています`);
    if (compressedSize === 0xffffffff || size === 0xffffffff) {
      throw new Error(`ZIP の ${name} は大きすぎて読めません（ZIP64）`);
    }
    if (!name.endsWith("/")) {
      files.set(
        name,
        extract(
          zip,
          name,
          method,
          compressedSize,
          size,
          zip.readUInt32LE(at + 42),
        ),
      );
    }
    at = next;
  }
  return files;
}
