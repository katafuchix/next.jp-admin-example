import type { AdSyncStatus, AdSyncTrigger } from "@/lib/ad-sync";
import type { AdSourceOverview, Kpi } from "@/lib/ad-sources/overview";
import type { AdSourceId } from "@/lib/ad-sources/types";
import { formatCurrency, formatNumber } from "@/lib/utils";

export function formatYen(value: number | null): string {
  return value === null ? "—" : formatCurrency(Math.round(value));
}

const YEN_PER_USER = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** ARPU など1人あたりの金額。円未満になりやすいので小数第1位まで出す */
export function formatYenPerUser(value: number | null): string {
  return value === null ? "—" : YEN_PER_USER.format(value);
}

export function formatCount(value: number | null): string {
  return value === null ? "—" : formatNumber(value);
}

/** ROAS・ROI は比率で返るので百分率にする */
export function formatRatio(value: number | null): string {
  return value === null ? "—" : `${formatNumber(Math.round(value * 100))}%`;
}

const SYNCED_AT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 同期日時を日本時間の「9月23日 11:05」にする（閲覧者の端末の時刻設定に左右されない） */
export function formatSyncedAt(iso: string): string {
  const part = Object.fromEntries(
    SYNCED_AT.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return `${part.month}月${part.day}日 ${part.hour}:${part.minute}`;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 日付キー（JST の "YYYY-MM-DD"）を「9/22（火）」にする。キーそのものを読むので端末の時刻設定に左右されない */
export function formatDayWithWeekday(key: string): string {
  const day = new Date(`${key}T00:00:00.000Z`);
  return `${day.getUTCMonth() + 1}/${day.getUTCDate()}（${WEEKDAYS[day.getUTCDay()]}）`;
}

const TRIGGER_LABEL: Record<AdSyncTrigger, string> = {
  cron: "自動",
  manual: "手動",
  csv: "CSV",
};

/** 最後に取り込んだ日時と取り込み方（「9月23日 11:05（自動）」） */
export function lastSyncLabel(source: AdSourceOverview): string {
  const run = source.latestRun;
  if (!run) return "—";
  return `${formatSyncedAt(run.finishedAt)}（${TRIGGER_LABEL[run.trigger]}）`;
}

export interface KpiNote {
  /** 値が欠けている・一部だけのときは true（画面ではアイコンつきで出す） */
  warning: boolean;
  text: string;
}

/** 指標カードの下に出す一言。問題が無ければ計算式、あれば何が足りないか */
export function kpiNote(
  kpi: Kpi,
  labels: ReadonlyMap<AdSourceId, string>,
  formula: string,
): KpiNote {
  const names = kpi.missing.map((id) => labels.get(id) ?? id).join("・");
  if (kpi.missing.length > 0) {
    return {
      warning: true,
      text:
        kpi.value === null
          ? `未接続: ${names}`
          : `一部のみ（未接続: ${names}）`,
    };
  }
  if (kpi.value === null) {
    return { warning: true, text: "分母が0のため計算できません" };
  }
  return { warning: false, text: formula };
}

export type SourceStateKind =
  "ok" | "failed" | "skipped" | "never-synced" | "not-configured";

export interface SourceState {
  kind: SourceStateKind;
  label: string;
  detail: string | null;
}

/** 媒体の状態は「最新の同期の結果」で決める。同期したことが無ければ認証情報の有無で分ける */
export function sourceState(source: AdSourceOverview): SourceState {
  const run = source.latestRun;
  if (run?.status === "success") {
    return { kind: "ok", label: "正常", detail: null };
  }
  if (run?.status === "failed") {
    return { kind: "failed", label: "失敗", detail: run.message };
  }
  if (run?.status === "skipped") {
    return { kind: "skipped", label: "未取得", detail: run.message };
  }
  if (source.csvImport) {
    return {
      kind: "never-synced",
      label: "取り込み待ち",
      detail: "管理画面の CSV をまだ取り込んでいません",
    };
  }
  if (source.configured) {
    return {
      kind: "never-synced",
      label: "同期待ち",
      detail: "まだ一度も同期していません",
    };
  }
  return {
    kind: "not-configured",
    label: "未接続",
    detail: "認証情報が未設定です",
  };
}

export interface SourceSummary {
  /** 主な数字の名前（「広告費」「収益」など） */
  label: string;
  /** 主な数字。画面では大きく出す */
  value: string;
  /** 添える数字や、まだ取り込めていない指標の断り書き */
  sub: string | null;
}

/** 期間内に取り込めた実績を、媒体の種類に合った主な数字と添え書きにする。一度も取り込めていなければ null */
export function sourceSummary(source: AdSourceOverview): SourceSummary | null {
  if (source.lastSuccessAt === null) return null;
  const t = source.totals;
  switch (source.id) {
    case "tenjin":
      return {
        label: "インストール",
        value: `${formatCount(t.installs)}件`,
        sub: null,
      };
    case "smaad_spend":
      return source.pendingMetrics.includes("spend")
        ? {
            label: "成果",
            value: `${formatCount(t.conversions)}件`,
            sub: "広告費は取り込み準備中",
          }
        : {
            label: "広告費",
            value: formatYen(t.spend),
            sub: `成果 ${formatCount(t.conversions)}件`,
          };
    case "appstore":
    case "googleplay":
      return source.pendingMetrics.includes("proceeds")
        ? {
            label: "売上",
            value: formatYen(t.grossSales),
            sub: "手取りは取り込み準備中",
          }
        : {
            label: "手取り",
            value: formatYen(t.proceeds),
            sub: `売上 ${formatYen(t.grossSales)}`,
          };
    default:
      return source.pendingMetrics.includes("revenue")
        ? {
            label: "表示",
            value: `${formatCount(t.impressions)}回`,
            sub: `クリック ${formatCount(t.clicks)}件・収益は取り込み準備中`,
          }
        : { label: "収益", value: formatYen(t.revenue), sub: null };
  }
}

export function summarizeSync(results: { status: AdSyncStatus }[]): string {
  const count = (status: AdSyncStatus) =>
    results.filter((r) => r.status === status).length;
  return `同期しました（成功 ${count("success")}・失敗 ${count("failed")}・未取得 ${count("skipped")}）`;
}

/** "2026-09-01" を「9月1日」にする（日付の文字列だけを見るので時差の影響を受けない） */
function monthDay(day: string): string {
  const [, month, date] = day.split("-");
  return `${Number(month)}月${Number(date)}日`;
}

export function summarizeImport(result: {
  label: string;
  range: { from: string; to: string };
  rowCount: number;
}): string {
  const { from, to } = result.range;
  const period =
    from === to ? monthDay(from) : `${monthDay(from)}〜${monthDay(to)}`;
  return `${result.label}: ${period}の${result.rowCount}行を取り込みました`;
}
