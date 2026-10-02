import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import {
  AD_REVENUE_SOURCES,
  buildAdOverview,
} from "@/lib/ad-sources/overview";
import { AD_SOURCES } from "@/lib/ad-sources/registry";
import {
  fetchSyncStatus,
  sumDailyBySource,
  sumDailyBySourceAndDay,
} from "@/lib/ad-sources/store";
import { resolveDayRange } from "@/lib/day-range";
import { jstDayKey } from "@/lib/jst-date";

const DEFAULT_SPAN_DAYS = 30;
const MAX_SPAN_DAYS = 366;

/**
 * 広告データ画面の中身。期間内の広告費・インストール・CPI・広告収益・課金の手取り・ROAS・ROI と、
 * 日別・媒体別の広告収益、媒体ごとの取り込み状況。
 * 取り込みは POST /api/ads/sync（ここでは読むだけ）。期間は JST の日付（両端を含む）、省略時は昨日までの30日間。
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const resolved = resolveDayRange({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    today: jstDayKey(new Date()),
    defaultSpanDays: DEFAULT_SPAN_DAYS,
    maxSpanDays: MAX_SPAN_DAYS,
  });
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error },
      { status: 400 },
    );
  }

  try {
    await connectDB();
    const [totals, status, dailyRevenue] = await Promise.all([
      sumDailyBySource(resolved.range),
      fetchSyncStatus(),
      sumDailyBySourceAndDay(resolved.range, AD_REVENUE_SOURCES, "revenue"),
    ]);
    const data = buildAdOverview({
      sources: AD_SOURCES,
      env: process.env,
      range: resolved.range,
      totals,
      ...status,
      dailyRevenue,
    });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[ads] 取得に失敗しました", { range: resolved.range, err });
    return NextResponse.json(
      { success: false, error: "広告データの取得に失敗しました" },
      { status: 500 },
    );
  }
}
