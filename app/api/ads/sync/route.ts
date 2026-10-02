import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { requireRole, WRITE_ROLES } from "@/lib/authz";
import { connectAppDB, connectDB } from "@/lib/db";
import { runAdSync, type AdSyncTrigger } from "@/lib/ad-sync";
import { autoSyncSources } from "@/lib/ad-sources/registry";
import { createMongoAdSyncStore } from "@/lib/ad-sources/store";
import { AD_SOURCE_IDS, type AdSourceId } from "@/lib/ad-sources/types";
import { resolveDayRange } from "@/lib/day-range";
import { jstDayKey } from "@/lib/jst-date";
import {
  createMongoPaidRateSnapshotStore,
  recordPaidRateSnapshot,
} from "@/lib/user-metrics/paid-snapshot";
import { countPaidUsers } from "@/lib/user-metrics/query";

/** 毎回取り直す日数（概算値が後から確定値に変わる媒体があるため、直近を上書きし続ける） */
const DEFAULT_SPAN_DAYS = 7;
const MAX_SPAN_DAYS = 93;
/**
 * Google Play の手取りは翌月上旬に出る収益レポートにしか無い。
 * 前月の初日までさかのぼれるよう、期間を省略したときだけ長めに取り直す
 */
const LONG_SPAN_DAYS: Partial<Record<AdSourceId, number>> = { googleplay: 62 };

const BodySchema = z.strictObject({
  from: z.string().optional(),
  to: z.string().optional(),
  sources: z.array(z.enum(AD_SOURCE_IDS)).min(1).optional(),
});

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status });
}

/** 長さの違いも含めて、比較にかかる時間から中身が推測できないように比べる */
function secretMatches(given: string, expected: string): boolean {
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * 呼び出し元を確かめる。
 * Authorization ヘッダーがあれば VPS の cron（共有シークレット）、無ければ画面からの手動実行（ログイン＋書き込み権限）。
 */
async function authorize(
  request: NextRequest,
): Promise<{ trigger: AdSyncTrigger } | { response: NextResponse }> {
  const header = request.headers.get("authorization");
  if (header !== null) {
    const secret = process.env.AD_SYNC_SECRET;
    if (!secret || !secretMatches(header, `Bearer ${secret}`)) {
      return { response: fail(401, "Unauthorized") };
    }
    return { trigger: "cron" };
  }

  const session = await auth();
  if (!session?.user) return { response: fail(401, "Unauthorized") };
  const forbidden = requireRole(session, WRITE_ROLES);
  if (forbidden) return { response: forbidden };
  return { trigger: "manual" };
}

async function readBody(request: NextRequest): Promise<unknown> {
  const text = await request.text();
  return text.trim() === "" ? {} : JSON.parse(text);
}

/**
 * 広告・売上の媒体から日次データを取り込む。
 * 本文（任意）: { from?: "YYYY-MM-DD", to?: "YYYY-MM-DD", sources?: 媒体ID[] }。省略時は昨日までの7日間（Google Play だけ62日間）・全媒体。
 * 媒体ごとの成否は results に入る（1つ失敗しても他は取り込む）。
 * ついでに今日（JST）の課金率を記録する（paidRate）。isPaid は今の状態しか無く、後から遡れないため。
 */
export async function POST(request: NextRequest) {
  const authorized = await authorize(request);
  if ("response" in authorized) return authorized.response;

  let raw: unknown;
  try {
    raw = await readBody(request);
  } catch {
    return fail(400, "リクエストの本文が JSON として読めません");
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return fail(400, "指定できるのは from・to・sources（媒体ID）だけです");
  }

  const today = jstDayKey(new Date());
  const resolveRange = (defaultSpanDays: number) =>
    resolveDayRange({
      from: parsed.data.from,
      to: parsed.data.to,
      today,
      defaultSpanDays,
      maxSpanDays: MAX_SPAN_DAYS,
      allowFuture: false,
    });
  const resolved = resolveRange(DEFAULT_SPAN_DAYS);
  if (!resolved.ok) return fail(400, resolved.error);

  const wanted = parsed.data.sources;
  // CSV を画面から取り込む媒体は、API の認証情報がそろうまで同期しない（autoSyncSources）
  const syncable = autoSyncSources(process.env);
  const sources = wanted
    ? syncable.filter((s) => wanted.includes(s.id))
    : syncable;

  try {
    await connectDB();
    // 広告の同期は外部 API 待ちで長く、落ちることもあるので、数えるだけの課金率を先に済ませる
    const paidRate = await recordPaidRateSnapshot({
      countUsers: async () => {
        const appConn = await connectAppDB();
        return appConn ? countPaidUsers(appConn) : null;
      },
      store: createMongoPaidRateSnapshotStore(),
      now: new Date(),
    });
    // 期間の長さごとに媒体を分けて取り込む（期間を指定されたときは全媒体が同じ期間になる）
    const spanOf = (id: AdSourceId) => LONG_SPAN_DAYS[id] ?? DEFAULT_SPAN_DAYS;
    const spans = [...new Set(sources.map((s) => spanOf(s.id)))];
    const store = createMongoAdSyncStore();
    const results = [];
    for (const span of spans) {
      const range = resolveRange(span);
      if (!range.ok) return fail(400, range.error);
      results.push(
        ...(await runAdSync({
          sources: sources.filter((s) => spanOf(s.id) === span),
          range: range.range,
          trigger: authorized.trigger,
          env: process.env,
          store,
        })),
      );
    }
    return NextResponse.json({
      success: true,
      data: { range: resolved.range, results, paidRate },
    });
  } catch (err) {
    console.error("[ads/sync] 同期に失敗しました", {
      range: resolved.range,
      trigger: authorized.trigger,
      err,
    });
    return fail(500, "広告データの同期に失敗しました");
  }
}
