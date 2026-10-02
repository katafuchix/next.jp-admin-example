import {
  AdSourceError,
  type AdDailyRow,
  type DayRange,
  type Env,
} from "./types";

/**
 * AdGeneration API（v2）から、広告の参考収益・表示回数・クリック数を日別・広告枠別に取る。
 * 仕様: https://ad-generation.jp/api_docs/v2/swagger.json
 *
 * - API キーは無い。管理画面のユーザー（メールアドレス・パスワード）でトークン（10分有効）を発行し、
 *   レポートの URL に `token=` で付ける。同期のたびに発行し直す
 * - 収益は「参考収益（税抜き）」。円（currency=JPY）で取り、円以外の行が来たら止める
 * - 集計対象（kind）は全種類を指定する（json 形式では必須）。同じ日・同じ広告枠の行は足し合わせる
 * - トークンは URL に載るので、URL をログに残さない
 */

const API_BASE = "https://ad-generation.jp/api/v2/";
const TIMEOUT_MS = 60_000;
const KINDS = ["adnw", "rtb", "additional_adnw", "house_ad", "pure_ad"];

type FetchImpl = typeof fetch;

/** performances.json の1行（dimensions[]=ad_placement のとき） */
interface Performance {
  date?: string;
  ad_placement_id?: number;
  ad_placement_name?: string;
  revenue?: number | null;
  currency?: string;
  impression?: number | null;
  click?: number | null;
}

const SHAPE_ERROR = "AdGeneration のレポートの形が想定と違います";

/** 失敗の応答の本文をログに残す（URL はトークンを含むので残さない） */
async function logFailure(step: string, res: Response): Promise<void> {
  const body = (await res.text().catch(() => "")).slice(0, 500);
  console.error(`[adgeneration] ${step}に失敗しました`, {
    status: res.status,
    body,
  });
}

async function issueToken(env: Env, fetchImpl: FetchImpl): Promise<string> {
  const res = await fetchImpl(new URL("tokens.json", API_BASE), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      email: env.ADGENERATION_EMAIL,
      password: env.ADGENERATION_PASSWORD,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    await logFailure("トークンの発行", res);
    throw new AdSourceError(
      res.status === 401
        ? "AdGeneration にログインできません（メールアドレス・パスワードが違うか、アカウントがロックされています）"
        : `AdGeneration の認証に失敗しました（HTTP ${res.status}）`,
    );
  }
  const body = (await res.json()) as { token?: unknown };
  if (typeof body.token !== "string" || !body.token) {
    throw new AdSourceError("AdGeneration からトークンが返ってきませんでした");
  }
  return body.token;
}

async function fetchPerformances(
  token: string,
  range: DayRange,
  fetchImpl: FetchImpl,
): Promise<Performance[]> {
  const url = new URL("report/performances.json", API_BASE);
  url.search = new URLSearchParams([
    ["token", token],
    ["currency", "JPY"],
    ["begin_date", range.from],
    ["end_date", range.to],
    ...KINDS.map((k) => ["kind[]", k]),
    ["dimensions[]", "ad_placement"],
  ]).toString();

  const res = await fetchImpl(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    await logFailure("レポート取得", res);
    throw new AdSourceError(
      `AdGeneration のレポート取得に失敗しました（HTTP ${res.status}）`,
    );
  }
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new AdSourceError(SHAPE_ERROR);
  return body as Performance[];
}

const num = (v: number | null | undefined) => (typeof v === "number" ? v : 0);

/** 同じ日・同じ広告枠の行を足し合わせて、広告枠×日の行にする */
function toDailyRows(rows: Performance[]): AdDailyRow[] {
  const byKey = new Map<string, AdDailyRow>();
  for (const p of rows) {
    if (!p.date || typeof p.ad_placement_id !== "number") {
      throw new AdSourceError(SHAPE_ERROR);
    }
    if (p.currency !== "JPY") {
      throw new AdSourceError(
        `AdGeneration の収益が円ではありません（${p.currency}）。取り込みを止めています`,
      );
    }
    const key = String(p.ad_placement_id);
    const id = `${p.date}/${key}`;
    const prev = byKey.get(id)?.metrics;
    byKey.set(id, {
      date: p.date,
      key,
      label: p.ad_placement_name ?? key,
      metrics: {
        revenue: num(prev?.revenue) + num(p.revenue),
        impressions: num(prev?.impressions) + num(p.impression),
        clicks: num(prev?.clicks) + num(p.click),
      },
    });
  }
  return [...byKey.values()];
}

export async function fetchAdGenerationDaily(
  range: DayRange,
  env: Env,
  fetchImpl: FetchImpl = fetch,
): Promise<AdDailyRow[]> {
  const token = await issueToken(env, fetchImpl);
  const rows = await fetchPerformances(token, range, fetchImpl);
  return toDailyRows(rows);
}
