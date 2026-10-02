import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { connectDB } from "@/lib/db"
import Inquiry from "@/models/Inquiry"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") ?? ""
  const priority = searchParams.get("priority") ?? ""
  const search = searchParams.get("search") ?? ""
  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const limit = parseInt(searchParams.get("limit") ?? "20", 10)

  try {
    await connectDB()
    const query: Record<string, unknown> = {}
    if (status) query.status = status
    if (priority) query.priority = priority
    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: "i" } },
        { userEmail: { $regex: search, $options: "i" } },
        { ticketId: { $regex: search, $options: "i" } },
      ]
    }

    const total = await Inquiry.countDocuments(query)
    const data = await Inquiry.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-replies")
      .lean()

    return NextResponse.json({
      success: true,
      data,
      meta: { total, page, limit },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
