import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import { fetchSyncStatus, sumMonthlyBySource } from "@/lib/ad-sources/store";
import { buildMonthlyRevenue, resolveYear } from "@/lib/revenue-monthly";

/**
 * 収支分析の月別集計。広告データ画面と同じ取り込みデータ（管理画面DB の AdDailyStat）を月ごとに足す。
 * 年は JST、省略時は今年。
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const resolved = resolveYear(
    new URL(request.url).searchParams.get("year"),
    new Date(),
  );
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error },
      { status: 400 },
    );
  }

  try {
    await connectDB();
    const [monthly, { lastSuccess }] = await Promise.all([
      sumMonthlyBySource(resolved.year),
      fetchSyncStatus(),
    ]);
    const data = buildMonthlyRevenue({
      year: resolved.year,
      monthly,
      lastSuccess,
    });
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[revenue] 取得に失敗しました", { year: resolved.year, err });
    return NextResponse.json(
      { success: false, error: "収益データの取得に失敗しました" },
      { status: 500 },
    );
  }
}
