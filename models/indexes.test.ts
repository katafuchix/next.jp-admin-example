import { readdirSync } from "node:fs";
import mongoose, { type Connection, type Schema } from "mongoose";
import { beforeAll, describe, expect, it } from "vitest";

// models/ 配下のモデルを全部読み込む（新しく足したモデルも自動で対象になる）
const modelFiles = readdirSync(__dirname).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
);

type IndexSpec = Record<string, unknown>;
type NamedSchema = { name: string; schema: Schema };

let schemas: NamedSchema[] = [];

/**
 * アプリDB側のモデルは `getXxxModel(conn)` で作るので、mongoose.models には載らない。
 * スキーマだけ受け取る偽の接続を渡して集める（DB にはつながない）。
 */
function schemasFromFactories(mod: Record<string, unknown>): NamedSchema[] {
  const found: NamedSchema[] = [];
  const conn = {
    models: {},
    model: (name: string, schema: Schema) => {
      found.push({ name, schema });
      return {};
    },
  } as unknown as Connection;
  for (const [key, value] of Object.entries(mod)) {
    if (/^get\w+Model$/.test(key) && typeof value === "function") value(conn);
  }
  return found;
}

beforeAll(async () => {
  const mods = await Promise.all(
    modelFiles.map((f) => import(`./${f}`) as Promise<Record<string, unknown>>),
  );
  schemas = [
    ...Object.values(mongoose.models).map((m) => ({
      name: m.modelName,
      schema: m.schema,
    })),
    ...mods.flatMap(schemasFromFactories),
  ];
});

/** Mongoose が起動時に出す「Duplicate schema index」警告と同じ判定（キーの順番と向きまで一致したら重複） */
function sameSpec(a: IndexSpec, b: IndexSpec): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every((k, i) => k === bKeys[i] && a[k] === b[k])
  );
}

function duplicateIndexes(): string[] {
  return schemas.flatMap(({ name, schema }) => {
    const seen: IndexSpec[] = [];
    const found: string[] = [];
    for (const [spec, options] of schema.indexes()) {
      if (options?.name == null && seen.some((s) => sameSpec(s, spec))) {
        found.push(`${name} ${JSON.stringify(spec)}`);
      }
      if (options?.name == null) seen.push(spec);
    }
    return found;
  });
}

describe("モデルのインデックス定義", () => {
  it("models/ の全ファイルのモデルを検査対象にできている（1ファイル1モデル）", () => {
    expect(modelFiles.length).toBeGreaterThan(0);
    expect(schemas.length).toBe(modelFiles.length);
  });

  it("同じインデックスを二重に宣言していない（サーバー起動のたびに警告が出るため）", () => {
    expect(duplicateIndexes()).toEqual([]);
  });
});
