import { NextRequest, NextResponse } from "next/server";
import { connectAppDB, connectDB } from "@/lib/db";
import Notification from "@/models/Notification";
import { sendFCMNotification } from "@/lib/notification-send";
import { countReach } from "@/lib/notification-reach";
import { deleteSchedulerJob } from "@/lib/scheduler";

/**
 * Cloud Scheduler から呼ばれる配信エンドポイント。
 * 管理者のセッション認証ではなく、共有シークレットで認証する。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const secret = process.env.NOTIFICATION_DISPATCH_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    await connectDB();
    const { id } = await params;

    const notification = await Notification.findById(id);
    if (!notification) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    const alreadySentOnce =
      notification.scheduleType === "once" && notification.status === "sent";
    if (!notification.enabled || alreadySentOnce) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: !notification.enabled ? "disabled" : "already_sent",
      });
    }

    // 数えられない状態で送ると配信数が残らないので、送らずに再試行させる
    const appDB = await connectAppDB();
    if (!appDB) {
      return NextResponse.json(
        {
          success: false,
          error:
            "APP_MONGODB_URI が未設定のため、届く人数を数えられず送信できません",
        },
        { status: 503 },
      );
    }
    const now = new Date();
    const totalTargets = await countReach(
      appDB,
      notification.targetSegment,
      now,
    );

    const result = await sendFCMNotification(
      notification.title,
      notification.body,
      notification.targetSegment,
    );
    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 },
      );
    }

    // 繰り返し配信は直近の回の人数で上書きする
    const update: Record<string, unknown> = {
      lastDispatchedAt: now,
      totalTargets,
    };
    if (notification.scheduleType === "once") {
      update.status = "sent";
      update.sentAt = now;
    }
    await Notification.findByIdAndUpdate(id, update);

    if (notification.scheduleType === "once" && notification.schedulerJobName) {
      try {
        await deleteSchedulerJob(notification.schedulerJobName);
      } catch (err) {
        // 削除失敗は致命的ではない(上の冪等ガードで再送は防げる)ためログのみ
        console.error(
          "[notifications/dispatch] Scheduler Jobの削除に失敗しました",
          err,
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
