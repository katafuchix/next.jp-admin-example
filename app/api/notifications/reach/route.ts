import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectAppDB } from "@/lib/db";
import { countReachBySegment } from "@/lib/notification-reach";

/** いま通知を送ったら届く人数（アプリの users を区分ごとに数える） */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

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

  const now = new Date();
  try {
    const counts = await countReachBySegment(appDB, now);
    return NextResponse.json({
      success: true,
      data: { counts, countedAt: now.toISOString() },
    });
  } catch (err) {
    console.error("[notifications/reach] 人数を数えられませんでした", err);
    return NextResponse.json(
      { success: false, error: "通知が届く人数を数えられませんでした" },
      { status: 500 },
    );
  }
}
