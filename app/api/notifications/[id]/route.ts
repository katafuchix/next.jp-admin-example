import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { connectDB } from "@/lib/db"
import Notification from "@/models/Notification"
import { requireRole, WRITE_ROLES } from "@/lib/authz"
import { deleteSchedulerJob, syncSchedulerJob } from "@/lib/scheduler"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  const forbidden = requireRole(session, WRITE_ROLES)
  if (forbidden) return forbidden

  try {
    await connectDB()
    const { id } = await params
    const body = await request.json()

    const existing = await Notification.findById(id)
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
    }

    const nextScheduleType = body.scheduleType ?? existing.scheduleType ?? "immediate"
    if (nextScheduleType === "once") {
      const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : existing.scheduledAt
      if (!scheduledAt || scheduledAt <= new Date()) {
        return NextResponse.json(
          { success: false, error: "配信日時は未来の日時を指定してください" },
          { status: 400 },
        )
      }
    }
    if (nextScheduleType === "recurring") {
      const daysOfWeek = body.recurrence?.daysOfWeek ?? existing.recurrence?.daysOfWeek
      const time = body.recurrence?.time ?? existing.recurrence?.time
      if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0) {
        return NextResponse.json(
          { success: false, error: "繰り返す曜日を1つ以上選択してください" },
          { status: 400 },
        )
      }
      if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) {
        return NextResponse.json(
          { success: false, error: "配信時刻を正しく指定してください" },
          { status: 400 },
        )
      }
    }

    // 送信予約の場合はscheduledAtを設定
    const update: Record<string, unknown> = { ...body }
    if (body.status === "scheduled" && body.scheduledAt) {
      update.scheduledAt = new Date(body.scheduledAt)
    }
    if (body.status === "sent") {
      update.sentAt = new Date()
    }

    // 配信方法をスケジュール系→即時に戻した場合はScheduler Jobを削除する
    if (nextScheduleType === "immediate" && existing.schedulerJobName) {
      await deleteSchedulerJob(existing.schedulerJobName)
      update.schedulerJobName = null
      update.cronExpression = null
    }

    let notification = await Notification.findByIdAndUpdate(id, update, { new: true })
    if (!notification) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
    }

    if (nextScheduleType !== "immediate") {
      try {
        const { schedulerJobName, cronExpression } = await syncSchedulerJob({
          id: notification._id.toString(),
          scheduleType: notification.scheduleType,
          scheduledAt: notification.scheduledAt,
          recurrence: notification.recurrence,
          enabled: notification.enabled,
          schedulerJobName: notification.schedulerJobName,
        })
        if (schedulerJobName || cronExpression) {
          notification = await Notification.findByIdAndUpdate(
            id,
            {
              ...(schedulerJobName && { schedulerJobName }),
              ...(cronExpression && { cronExpression }),
            },
            { new: true },
          )
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Cloud Schedulerの更新に失敗しました"
        return NextResponse.json({ success: false, error: message }, { status: 500 })
      }
    }

    try {
      const AuditLog = (await import("@/models/AuditLog")).AuditLog
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "UPDATE",
        resource: "Notification",
        resourceId: id,
        detail: { status: body.status, title: body.title, scheduleType: nextScheduleType },
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      })
    } catch (err) {
      console.error("[AuditLog] UPDATE Notification の記録に失敗しました", err)
    }

    return NextResponse.json({ success: true, data: notification })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  const forbidden = requireRole(session, WRITE_ROLES)
  if (forbidden) return forbidden

  try {
    await connectDB()
    const { id } = await params

    const notification = await Notification.findById(id)
    if (!notification) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
    }

    if (notification.schedulerJobName) {
      await deleteSchedulerJob(notification.schedulerJobName)
    }
    await Notification.findByIdAndDelete(id)

    try {
      const AuditLog = (await import("@/models/AuditLog")).AuditLog
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "DELETE",
        resource: "Notification",
        resourceId: id,
        detail: { title: notification.title },
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      })
    } catch (err) {
      console.error("[AuditLog] DELETE Notification の記録に失敗しました", err)
    }

    return NextResponse.json({ success: true, data: { id } })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
