import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectAppDB, connectDB } from "@/lib/db";
import Notification from "@/models/Notification";
import { requireRole, WRITE_ROLES } from "@/lib/authz";
import {
  SEGMENT_TOPIC_MAP,
  sendFCMNotification,
} from "@/lib/notification-send";
import { countReach } from "@/lib/notification-reach";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  const forbidden = requireRole(session, WRITE_ROLES);
  if (forbidden) return forbidden;

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

    if (
      notification.status !== "draft" &&
      notification.status !== "scheduled"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot send notification with status "${notification.status}". Only draft or scheduled notifications can be sent.`,
        },
        { status: 400 },
      );
    }

    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            "通知の鍵（FIREBASE_SERVICE_ACCOUNT_KEY）が未設定のため送信できません",
        },
        { status: 503 },
      );
    }

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

    await Notification.findByIdAndUpdate(id, {
      status: "sent",
      sentAt: now,
      totalTargets,
    });

    return NextResponse.json({
      success: true,
      message: `Notification sent successfully via FCM (topic: ${SEGMENT_TOPIC_MAP[notification.targetSegment] ?? "hapiken-all"}).`,
      totalTargets,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
}
