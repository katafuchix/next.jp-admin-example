import { fetchAdGenerationDaily } from "./adgeneration";
import { fetchAppStoreDaily } from "./appstore";
import { fetchGooglePlayDaily } from "./googleplay";
import { parseSmaadCsv } from "./smaad-csv";
import { fetchSmaadSpendDaily } from "./smaad-spend";
import { parseSmaadSpendCsv } from "./smaad-spend-csv";
import { fetchTenjinDaily } from "./tenjin";
import { fetchTenjinAdmobDaily } from "./tenjin-admob";
import type { AdMetricKey, AdSource, AdSourceId, Env } from "./types";

/**
 * 取り込み元の7媒体。環境変数の名前は認証情報が届いた時点で見直す。
 * 取得処理（fetchDaily）は媒体ごとに実装して足していく。
 */
export const AD_SOURCES: readonly AdSource[] = [
  {
    id: "tenjin",
    label: "Tenjin",
    provides:
      "インストール数（日付は UTC で区切られる。日本時間の朝9時が境目）",
    requiredEnv: ["TENJIN_API_KEY"],
    // 広告費は SmaAD（広告出稿）から取る。Tenjin の広告費は取り込まない（取得処理も、入っていたら止める）
    fetchDaily: (range, env) => fetchTenjinDaily(range, env),
  },
  {
    id: "smaad_spend",
    label: "SmaAD（広告出稿）",
    provides:
      "広告費（利用金額）・成果件数（広告主向けの Report API から取る。CSV の取り込みもできる。i-mobile など他の出稿先は含まない）",
    // API キーとアカウント ID がそろうまでは同期に含めず、CSV を画面から取り込む（autoSyncSources）
    requiredEnv: ["SMAAD_ADVERTISER_API_KEY", "SMAAD_ADVERTISER_ACCOUNT_ID"],
    fetchDaily: (range, env) => fetchSmaadSpendDaily(range, env),
    parseCsv: parseSmaadSpendCsv,
  },
  {
    id: "admob",
    label: "Google AdMob",
    provides:
      "バナー広告の収益・表示回数・クリック数（Tenjin 経由。収益は米ドルをその日の為替（欧州中央銀行）で円に換算。日付は UTC で区切られる。日本時間の朝9時が境目）",
    // AdMob を直接つなぐ取得処理（admob.ts の fetchAdmobDaily）もあるが、クライアントの Google アカウントの
    // 二段階認証が要るので、それまでは Tenjin 経由で取る。直接に切り替えるときは requiredEnv を
    // ADMOB_CLIENT_ID・ADMOB_CLIENT_SECRET・ADMOB_REFRESH_TOKEN・ADMOB_PUBLISHER_ID に戻す
    // （日付の区切りが日本時間に変わるので、切り替えは環境変数の有無で自動にしない）
    requiredEnv: ["TENJIN_API_KEY"],
    fetchDaily: (range, env) => fetchTenjinAdmobDaily(range, env),
  },
  {
    id: "adgeneration",
    label: "AdGeneration",
    provides: "広告の参考収益（税抜き）・表示回数・クリック数（広告枠別）",
    // API キーは無く、管理画面のユーザーのメールアドレス・パスワードで10分有効のトークンを発行する
    requiredEnv: ["ADGENERATION_EMAIL", "ADGENERATION_PASSWORD"],
    fetchDaily: (range, env) => fetchAdGenerationDaily(range, env),
  },
  {
    id: "smaad",
    label: "SmaAD",
    provides:
      "オファーウォールの収益（発生金額・承認前を含む）・クリック数・成果件数（管理画面の日別レポートを発生日で出した CSV を画面から取り込む）",
    // 媒体向けの API は見つかっていないので、同期（定期実行）には含めず CSV を画面から取り込む
    requiredEnv: [],
    parseCsv: parseSmaadCsv,
  },
  {
    id: "appstore",
    label: "App Store Connect",
    provides: "iOS の課金売上（日付は米国太平洋時間で区切られる）",
    requiredEnv: [
      "APPSTORE_ISSUER_ID",
      "APPSTORE_KEY_ID",
      "APPSTORE_PRIVATE_KEY",
      "APPSTORE_VENDOR_NUMBER",
    ],
    fetchDaily: (range, env) => fetchAppStoreDaily(range, env),
  },
  {
    id: "googleplay",
    label: "Google Play Console",
    provides:
      "Android の課金売上（税込・日付は日本時間で区切る）。手取りは月1回の収益レポートから注文ごとに引き当てて取り込むが、月の途中は手取りの無い日が混ざるので、画面ではまだ未接続として扱う",
    requiredEnv: [
      "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
      "GOOGLE_PLAY_REPORTS_BUCKET",
    ],
    pendingMetrics: ["proceeds"],
    fetchDaily: (range, env) => fetchGooglePlayDaily(range, env),
  },
];

export function findAdSource(
  id: AdSourceId,
  sources: readonly AdSource[] = AD_SOURCES,
): AdSource {
  const source = sources.find((s) => s.id === id);
  if (!source) throw new Error(`未知の媒体です: ${id}`);
  return source;
}

/** 取り込みに成功していて、その指標をもう取り込んでいる媒体か */
export function hasJoined(
  sources: readonly AdSource[],
  lastSuccess: ReadonlyMap<AdSourceId, Date>,
  id: AdSourceId,
  metric: AdMetricKey,
): boolean {
  const pending = sources.find((s) => s.id === id)?.pendingMetrics ?? [];
  return lastSuccess.has(id) && !pending.includes(metric);
}

/** 未設定（空白だけも含む）の環境変数の名前 */
export function missingEnv(source: AdSource, env: Env): string[] {
  return source.requiredEnv.filter((name) => !env[name]?.trim());
}

/**
 * cron・同期ボタンで取りに行く媒体。CSV も取り込める媒体は、認証情報がそろったときだけ含める
 * （未設定のまま同期すると「未接続」や「未実装」が記録され、CSV の取り込み記録より新しくなって画面の状態を上書きするため）
 */
export function autoSyncSources(env: Env): AdSource[] {
  return AD_SOURCES.filter(
    (s) =>
      !s.parseCsv ||
      (s.fetchDaily !== undefined && missingEnv(s, env).length === 0),
  );
}
