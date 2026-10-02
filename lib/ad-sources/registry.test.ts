import { describe, expect, it } from "vitest";
import { AD_SOURCES, autoSyncSources, findAdSource } from "./registry";

const provides = (id: string) =>
  AD_SOURCES.find((s) => s.id === id)?.provides ?? "";

describe("AD_SOURCES の説明文", () => {
  // 日本時間と違う区切りの媒体は、画面の数字が日本時間の1日とずれることを説明文で知らせる
  it("Tenjin は日付が UTC で区切られることを書く", () => {
    expect(provides("tenjin")).toContain("UTC");
  });

  // 広告費は SmaAD の広告出稿から取るので、Tenjin の説明に広告費を書かない
  it("Tenjin はインストール数だけを取ることを書く", () => {
    expect(provides("tenjin")).toContain("インストール数");
    expect(provides("tenjin")).not.toContain("広告費");
  });

  it("App Store は日付が米国太平洋時間で区切られることを書く", () => {
    expect(provides("appstore")).toContain("米国太平洋時間");
  });

  it("AdMob は Tenjin 経由で取っていて、日付が UTC で区切られることを書く", () => {
    expect(provides("admob")).toContain("Tenjin 経由");
    expect(provides("admob")).toContain("UTC");
  });
});

describe("Google Play の取り込み", () => {
  it("日付を日本時間で区切り、手取りはまだ取っていないことを書く", () => {
    expect(provides("googleplay")).toContain("日本時間");
    expect(provides("googleplay")).toContain("手取り");
  });

  it("売上レポートから取り込む", () => {
    expect(findAdSource("googleplay").fetchDaily).toBeTypeOf("function");
  });

  // 手取りは月1回の収益レポートにしか無い。￥0 と出さないよう準備中にしておく
  it("手取りは取り込み準備中", () => {
    expect(findAdSource("googleplay").pendingMetrics).toEqual(["proceeds"]);
  });
});

describe("AdMob の取り込み", () => {
  it("Tenjin の API キーだけで取れる（クライアントの Google アカウントは要らない）", () => {
    expect(findAdSource("admob").requiredEnv).toEqual(["TENJIN_API_KEY"]);
  });

  // Tenjin の ad_revenue は円（09-17 Android の 9.21 が AdMob 管理画面の約9円と一致）
  it("収益も取り込み、広告収益の合計に数える", () => {
    expect(findAdSource("admob").pendingMetrics ?? []).not.toContain("revenue");
  });
});

describe("AdGeneration の取り込み", () => {
  // AdGeneration に API キーは無く、管理画面のユーザーでトークンを発行する
  it("メールアドレスとパスワードで取る", () => {
    expect(findAdSource("adgeneration").requiredEnv).toEqual([
      "ADGENERATION_EMAIL",
      "ADGENERATION_PASSWORD",
    ]);
    expect(findAdSource("adgeneration").fetchDaily).toBeTypeOf("function");
  });

  it("収益が税抜きの参考値であることを書く", () => {
    expect(provides("adgeneration")).toContain("税抜き");
  });
});

describe("SmaAD の取り込み", () => {
  // SmaAD の媒体向けの API は見つかっていないので、管理画面の日別レポートの CSV を画面から取り込む
  it("認証情報は使わず、CSV を読む処理だけを持つ", () => {
    const smaad = findAdSource("smaad");
    expect(smaad.requiredEnv).toEqual([]);
    expect(smaad.parseCsv).toBeTypeOf("function");
    expect(smaad.fetchDaily).toBeUndefined();
  });

  it("CSV を発生日で出して取り込むことを書く", () => {
    expect(provides("smaad")).toContain("CSV");
    expect(provides("smaad")).toContain("発生日");
  });
});

describe("SmaAD（広告出稿）の取り込み", () => {
  // 広告費の出どころ。広告主向けの Report API で取り、キーが届くまでは CSV を画面から取り込む
  it("広告主の API キーとアカウント ID で取り、CSV の取り込みも残す", () => {
    const spend = findAdSource("smaad_spend");
    expect(spend.label).toBe("SmaAD（広告出稿）");
    expect(spend.requiredEnv).toEqual([
      "SMAAD_ADVERTISER_API_KEY",
      "SMAAD_ADVERTISER_ACCOUNT_ID",
    ]);
    expect(spend.fetchDaily).toBeTypeOf("function");
    expect(spend.parseCsv).toBeTypeOf("function");
    expect(spend.pendingMetrics ?? []).toEqual([]);
  });

  it("利用金額を広告費として API と CSV から取り込むことを書く", () => {
    expect(provides("smaad_spend")).toContain("利用金額");
    expect(provides("smaad_spend")).toContain("API");
    expect(provides("smaad_spend")).toContain("CSV");
  });
});

describe("autoSyncSources（cron・同期ボタンで取りに行く媒体）", () => {
  const ids = (env: Record<string, string | undefined>) =>
    autoSyncSources(env).map((s) => s.id);
  const SPEND_ENV = {
    SMAAD_ADVERTISER_API_KEY: "key",
    SMAAD_ADVERTISER_ACCOUNT_ID: "999999999",
  };

  it("CSV でしか取り込めない媒体（SmaAD の収益）は含めない", () => {
    expect(ids(SPEND_ENV)).not.toContain("smaad");
  });

  // 未設定のまま同期すると「認証情報が未設定です」が1日2回記録され、CSV の取り込み記録より新しくなって画面の状態を上書きする
  it("CSV も取り込める媒体は、認証情報がそろうまで含めない", () => {
    expect(ids({})).not.toContain("smaad_spend");
    expect(ids({ ...SPEND_ENV, SMAAD_ADVERTISER_API_KEY: "  " })).not.toContain(
      "smaad_spend",
    );
    expect(ids(SPEND_ENV)).toContain("smaad_spend");
  });

  it("API だけの媒体は、認証情報が無くても含める（未接続として記録するため）", () => {
    expect(ids({})).toEqual([
      "tenjin",
      "admob",
      "adgeneration",
      "appstore",
      "googleplay",
    ]);
  });
});
