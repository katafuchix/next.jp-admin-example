import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectAppDB } from "@/lib/db";
import { resolveDayRange } from "@/lib/day-range";
import { jstDayKey } from "@/lib/jst-date";
import { fetchAppPointStats } from "@/lib/app-points/query";

const DEFAULT_SPAN_DAYS = 30;
const MAX_SPAN_DAYS = 366;

/**
 * アプリで実際に付与・消費されたポイント（care の buddypointlogs）の集計。
 * 期間は JST の日付（YYYY-MM-DD、両端を含む）。省略時は昨日までの30日間。
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
  const { from, to } = resolved.range;

  const appDB = await connectAppDB();
  if (!appDB) {
    return NextResponse.json(
      {
        success: false,
        error: "APP_MONGODB_URI が未設定のため取得できません",
      },
      { status: 503 },
    );
  }

  try {
    const data = await fetchAppPointStats(appDB, { from, to });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[points/app-stats] 集計に失敗しました", { from, to, err });
    return NextResponse.json(
      { success: false, error: "ポイントの集計に失敗しました" },
      { status: 500 },
    );
  }
}
