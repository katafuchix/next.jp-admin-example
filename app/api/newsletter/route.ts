import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Newsletter from "@/models/Newsletter";
import { requireRole, WRITE_ROLES } from "@/lib/authz";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);

  try {
    await connectDB();
    const total = await Newsletter.countDocuments();
    const docs = await Newsletter.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const data = docs.map((n) => ({
      id: n._id.toString(),
      title: n.title,
      subject: n.subject,
      status: n.status,
      targetCount: n.totalRecipients,
      openRate:
        n.totalRecipients > 0 ? n.opened / n.totalRecipients : 0,
      clickRate:
        n.totalRecipients > 0 ? n.clicked / n.totalRecipients : 0,
      scheduledAt: n.scheduledAt
        ? new Date(n.scheduledAt).toISOString()
        : undefined,
      sentAt: n.sentAt ? new Date(n.sentAt).toISOString() : undefined,
      createdAt:
        n.createdAt instanceof Date
          ? n.createdAt.toISOString()
          : String(n.createdAt),
    }));

    return NextResponse.json({
      success: true,
      data,
      meta: { total, page, limit },
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

    const newsletter = await Newsletter.create({
      title: body.title,
      subject: body.subject,
      body: body.body ?? "",
      status: "draft",
      totalRecipients: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      unsubscribed: 0,
      createdBy: session.user.id,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
    });

    try {
      const { AuditLog } = await import("@/models/AuditLog");
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "CREATE",
        resource: "Newsletter",
        resourceId: newsletter._id.toString(),
        detail: { title: body.title, subject: body.subject },
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      });
    } catch (err) {
      console.error("[AuditLog] CREATE Newsletter の記録に失敗しました", err);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          id: newsletter._id.toString(),
          title: newsletter.title,
          subject: newsletter.subject,
          status: newsletter.status,
          targetCount: 0,
          openRate: 0,
          clickRate: 0,
          createdAt:
            newsletter.createdAt instanceof Date
              ? newsletter.createdAt.toISOString()
              : String(newsletter.createdAt),
        },
      },
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
