import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import { auth } from "@/auth"
import { connectDB } from "@/lib/db"
import Inquiry from "@/models/Inquiry"
import { requireRole, INQUIRY_WRITE_ROLES } from "@/lib/authz"

export async function POST(
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
    const { body } = await request.json()

    if (!body || typeof body !== "string" || body.trim() === "") {
      return NextResponse.json({ success: false, error: "body is required" }, { status: 400 })
    }

    const adminObjectId = new mongoose.Types.ObjectId(session.user.id as string)

    const inquiry = await Inquiry.findByIdAndUpdate(
      id,
      {
        $push: { replies: { adminId: adminObjectId, body: body.trim(), createdAt: new Date() } },
        $set: { status: "in_progress", updatedAt: new Date() },
      },
      { new: true }
    )

    if (!inquiry) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 })
    }

    try {
      const { AuditLog } = await import("@/models/AuditLog")
      await AuditLog.create({
        adminId: adminObjectId,
        adminEmail: session.user.email,
        action: "UPDATE",
        resource: "Inquiry",
        resourceId: id,
        detail: { action: "reply", status: "in_progress" },
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
