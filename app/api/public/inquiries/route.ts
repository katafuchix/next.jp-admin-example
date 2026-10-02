import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/db"
import Inquiry from "@/models/Inquiry"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

function generateTicketId(): string {
  const now = new Date()
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "")
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, "0")
  return `INQ-${yyyymmdd}-${rand}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { userEmail, subject, body: msgBody, category, userId } = body

    if (!userEmail || !subject || !msgBody || !category) {
      return NextResponse.json(
        { success: false, error: "userEmail, subject, body, category are required" },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const validCategories = ["billing", "technical", "account", "other"]
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { success: false, error: `category must be one of: ${validCategories.join(", ")}` },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    await connectDB()

    const ticketId = generateTicketId()

    await Inquiry.create({
      ticketId,
      userEmail,
      subject,
      body: msgBody,
      category,
      priority: "medium",
      status: "open",
      ...(userId ? { userId } : {}),
    })

    return NextResponse.json(
      { success: true, data: { ticketId } },
      { status: 201, headers: CORS_HEADERS }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
