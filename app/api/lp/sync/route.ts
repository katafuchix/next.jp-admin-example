import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import LPPage from "@/models/LPPage";
import { requireRole, WRITE_ROLES } from "@/lib/authz";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const forbidden = requireRole(session, WRITE_ROLES);
  if (forbidden) return forbidden;

  // GA4 から実数を取れないときは、作り物の数字で上書きせずに止める
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    return NextResponse.json(
      {
        success: false,
        error:
          "GA4 の接続（GOOGLE_APPLICATION_CREDENTIALS_JSON）が未設定のため同期できません",
      },
      { status: 503 },
    );
  }

  let BetaAnalyticsDataClient: new (opts: { credentials: unknown }) => {
    runReport(
      params: unknown,
    ): Promise<[{ rows?: Array<{ metricValues?: Array<{ value?: string }> }> }]>;
  };
  try {
    // 入っていなくてもビルドが通るよう、import ではなく require で読む
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gaModule = require("@google-analytics/data") as {
      BetaAnalyticsDataClient: typeof BetaAnalyticsDataClient;
    };
    BetaAnalyticsDataClient = gaModule.BetaAnalyticsDataClient;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          "GA4 の読み取り部品（@google-analytics/data）が入っていないため同期できません",
      },
      { status: 503 },
    );
  }

  let body: { slug?: unknown } = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    // body が空の場合は全LP同期
  }

  try {
    await connectDB();

    // 文字列以外（{ $ne: null } など）で全件に広がらないよう、型を確かめてから使う
    const query =
      typeof body.slug === "string" && body.slug ? { slug: body.slug } : {};
    const lps = await LPPage.find(query).lean();

    const credentials = JSON.parse(
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    );
    const analyticsClient = new BetaAnalyticsDataClient({ credentials });

    let synced = 0;
    let failed = 0;

    for (const lp of lps) {
      // gaPropertyId がない LP はスキップ
      const gaPropertyId = (lp as Record<string, unknown>).gaPropertyId as
        | string
        | undefined;
      if (!gaPropertyId) continue;

      try {
        const [report] = await analyticsClient.runReport({
          property: `properties/${gaPropertyId}`,
          dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
          metrics: [{ name: "sessions" }, { name: "conversions" }],
        });

        const row = report.rows?.[0];
        const newSessions = parseInt(row?.metricValues?.[0]?.value ?? "0", 10);
        const newConversions = parseInt(
          row?.metricValues?.[1]?.value ?? "0",
          10,
        );

        await LPPage.findByIdAndUpdate(lp._id, {
          sessions: newSessions,
          conversions: newConversions,
          lastSyncedAt: new Date(),
        });

        synced++;
      } catch (err) {
        console.error(`[lp/sync] ${lp.slug} の GA4 取得に失敗しました`, err);
        failed++;
      }
    }

    return NextResponse.json({ success: true, synced, failed });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
