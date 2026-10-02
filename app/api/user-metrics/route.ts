import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectAppDB } from "@/lib/db";
import { resolveDayRange } from "@/lib/day-range";
import { jstDayKey } from "@/lib/jst-date";
import { fetchUserMetrics } from "@/lib/user-metrics/query";

const DEFAULT_SPAN_DAYS = 30;
const MAX_SPAN_DAYS = 366;

function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}

/**
 * DAU / WAU / MAU・継続率・総ログイン数・新規／総ユーザー・登録曜日×時間帯・課金率。
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

  const today = jstDayKey(new Date());
  const { searchParams } = new URL(request.url);
  const resolved = resolveDayRange({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    today,
    defaultSpanDays: DEFAULT_SPAN_DAYS,
    maxSpanDays: MAX_SPAN_DAYS,
  });
  if (!resolved.ok) return badRequest(resolved.error);
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
    const data = await fetchUserMetrics(appDB, { from, to, today });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[user-metrics] 集計に失敗しました", { from, to, err });
    return NextResponse.json(
      { success: false, error: "ユーザー指標の取得に失敗しました" },
      { status: 500 },
    );
  }
}
