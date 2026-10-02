import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { connectDB } from "@/lib/db"
import Inquiry from "@/models/Inquiry"
import { requireRole, INQUIRY_WRITE_ROLES } from "@/lib/authz"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    await connectDB()
    const { id } = await params
    const data = await Inquiry.findById(id).lean()
    if (!data) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ success: true, data })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }
  const forbidden = requireRole(session, INQUIRY_WRITE_ROLES)
  if (forbidden) return forbidden

  try {
    await connectDB()
    const { id } = await params
    const body = await request.json()

    const update: Record<string, unknown> = {}
    if (body.status) update.status = body.status
    if (body.assigneeId) update.assigneeId = body.assigneeId
    if (body.priority) update.priority = body.priority

    // 返信追加
    if (body.reply) {
      const inquiry = await Inquiry.findByIdAndUpdate(
        id,
        {
          ...update,
          $push: {
            replies: {
              adminId: session.user.id,
              body: body.reply,
              createdAt: new Date(),
            },
          },
        },
        { new: true }
      )
      if (!inquiry) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
      }

      try {
        const AuditLog = (await import("@/models/AuditLog")).AuditLog
        await AuditLog.create({
          adminId: session.user.id,
          adminEmail: session.user.email,
          action: "UPDATE",
          resource: "Inquiry",
          resourceId: id,
          detail: { action: "reply", status: update.status },
          ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
        })
      } catch (err) {
        console.error("[AuditLog] UPDATE Inquiry の記録に失敗しました", err)
      }

      return NextResponse.json({ success: true, data: inquiry })
    }

    const inquiry = await Inquiry.findByIdAndUpdate(id, update, { new: true })
    if (!inquiry) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
    }

    try {
      const AuditLog = (await import("@/models/AuditLog")).AuditLog
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "UPDATE",
        resource: "Inquiry",
        resourceId: id,
        detail: { status: body.status, priority: body.priority },
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      })
    } catch (err) {
      console.error("[AuditLog] UPDATE Inquiry の記録に失敗しました", err)
    }

    return NextResponse.json({ success: true, data: inquiry })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
