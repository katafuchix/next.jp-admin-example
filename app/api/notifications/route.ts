import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Notification from "@/models/Notification";
import { requireRole, WRITE_ROLES } from "@/lib/authz";
import { syncSchedulerJob } from "@/lib/scheduler";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);

  try {
    await connectDB();
    const query: Record<string, unknown> = {};
    if (status) query.status = status;

    const total = await Notification.countDocuments(query);
    const docs = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const data = docs.map((n) => ({
      id: (n._id as { toString(): string }).toString(),
      title: n.title,
      body: n.body ?? "",
      targetSegment: n.targetSegment,
      status: n.status,
      scheduleType: n.scheduleType ?? "immediate",
      enabled: n.enabled ?? true,
      recurrence: n.recurrence ?? null,
      cronExpression: n.cronExpression ?? null,
      lastDispatchedAt: n.lastDispatchedAt
        ? new Date(n.lastDispatchedAt).toISOString()
        : null,
      scheduledAt: n.scheduledAt ? new Date(n.scheduledAt).toISOString() : null,
      // 送信した時点で通知を受け取れる状態だった人数（端末を登録した人）
      reachCount: n.totalTargets ?? 0,
    }));

    return NextResponse.json({
      success: true,
      data,
      meta: { total, page, limit },
    });
  } catch (err) {
    console.error("[notifications] 一覧の取得に失敗しました", err);
    return NextResponse.json(
      { success: false, error: "通知の一覧を読み込めませんでした" },
      { status: 500 },
    );
  }
}

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

  try {
    await connectDB();
    const body = await request.json();

    const scheduleType = body.scheduleType ?? "immediate";
    if (scheduleType === "once") {
      if (!body.scheduledAt || new Date(body.scheduledAt) <= new Date()) {
        return NextResponse.json(
          { success: false, error: "配信日時は未来の日時を指定してください" },
          { status: 400 },
        );
      }
    }
    if (scheduleType === "recurring") {
      const daysOfWeek = body.recurrence?.daysOfWeek;
      const time = body.recurrence?.time;
      if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0) {
        return NextResponse.json(
          { success: false, error: "繰り返す曜日を1つ以上選択してください" },
          { status: 400 },
        );
      }
      if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) {
        return NextResponse.json(
          { success: false, error: "配信時刻を正しく指定してください" },
          { status: 400 },
        );
      }
    }

    const notification = await Notification.create({
      ...body,
      status: scheduleType === "immediate" ? "draft" : "scheduled",
      createdBy: session.user.id,
    });

    if (scheduleType !== "immediate") {
      try {
        const { schedulerJobName, cronExpression } = await syncSchedulerJob({
          id: notification._id.toString(),
          scheduleType: notification.scheduleType,
          scheduledAt: notification.scheduledAt,
          recurrence: notification.recurrence,
          enabled: notification.enabled,
          schedulerJobName: notification.schedulerJobName,
        });
        if (schedulerJobName || cronExpression) {
          await Notification.findByIdAndUpdate(notification._id, {
            ...(schedulerJobName && { schedulerJobName }),
            ...(cronExpression && { cronExpression }),
          });
        }
      } catch (err) {
        // Scheduler側の登録に失敗した場合は中途半端な状態を残さずロールバックする
        await Notification.findByIdAndDelete(notification._id);
        const message =
          err instanceof Error
            ? err.message
            : "Cloud Schedulerへの登録に失敗しました";
        return NextResponse.json(
          { success: false, error: message },
          { status: 500 },
        );
      }
    }

    try {
      const AuditLog = (await import("@/models/AuditLog")).AuditLog;
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "CREATE",
        resource: "Notification",
        resourceId: notification._id?.toString(),
        detail: { title: body.title, scheduleType },
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      });
    } catch (err) {
      console.error("[AuditLog] CREATE Notification の記録に失敗しました", err);
    }

    return NextResponse.json(
      { success: true, data: notification },
      { status: 201 },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
