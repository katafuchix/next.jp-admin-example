import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB, connectAppDB } from "@/lib/db";
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  { email: String, displayName: String, createdAt: Date },
  { strict: false, collection: "users" },
);

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const [, appDB] = await Promise.all([
      connectDB().catch(() => null),
      connectAppDB().catch(() => null),
    ]);

    const [Notification, Inquiry] = await Promise.all([
      import("@/models/Notification").then((m) => m.default),
      import("@/models/Inquiry").then((m) => m.default),
    ]);

    // 収益は収支分析と同じ集計を /api/revenue から取る（ダッシュボードの RevenueTrend）
    const [pendingNotifications, openInquiries] = await Promise.all([
      Notification.countDocuments({
        status: { $in: ["draft", "scheduled"] },
      }),
      Inquiry.countDocuments({ status: "open" }),
    ]);

    // アプリDB: ユーザー数
    let totalUsers = 0;
    let newUsersToday = 0;
    if (appDB) {
      const UserModel = appDB.models.User ?? appDB.model("User", UserSchema);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [total, todayCount] = await Promise.all([
        UserModel.countDocuments({}),
        UserModel.countDocuments({ createdAt: { $gte: todayStart } }),
      ]);
      totalUsers = total;
      newUsersToday = todayCount;
    }

    return NextResponse.json({
      success: true,
      data: {
        pendingNotifications,
        openInquiries,
        totalUsers,
        newUsersToday,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
