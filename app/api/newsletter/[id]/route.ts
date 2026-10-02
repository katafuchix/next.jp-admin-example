import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import Newsletter from "@/models/Newsletter";
import { requireRole, WRITE_ROLES } from "@/lib/authz";

export async function PUT(
  request: NextRequest,
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
    const body = await request.json();

    // 実際の送信・失敗判定は /api/newsletter/[id]/send が行うため、
    // ここでは下書き・件名などの編集のみを許可し status は変更させない
    const allowedFields: Array<"title" | "subject" | "body" | "scheduledAt"> =
      ["title", "subject", "body", "scheduledAt"];
    const update: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) update[field] = body[field];
    }
    if (typeof update.scheduledAt === "string") {
      update.scheduledAt = new Date(update.scheduledAt);
    }

    const newsletter = await Newsletter.findByIdAndUpdate(id, update, {
      new: true,
    });
    if (!newsletter) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    const data = {
      id: newsletter._id.toString(),
      title: newsletter.title,
      subject: newsletter.subject,
      status: newsletter.status,
      targetCount: newsletter.totalRecipients,
      openRate:
        newsletter.totalRecipients > 0
          ? newsletter.opened / newsletter.totalRecipients
          : 0,
      clickRate:
        newsletter.totalRecipients > 0
          ? newsletter.clicked / newsletter.totalRecipients
          : 0,
      scheduledAt: newsletter.scheduledAt
        ? new Date(newsletter.scheduledAt).toISOString()
        : undefined,
      sentAt: newsletter.sentAt
        ? new Date(newsletter.sentAt).toISOString()
        : undefined,
      updatedAt: newsletter.updatedAt.toISOString(),
    };

    try {
      const AuditLog = (await import("@/models/AuditLog")).AuditLog;
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "UPDATE",
        resource: "Newsletter",
        resourceId: id,
        detail: update,
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      });
    } catch (err) {
      console.error("[AuditLog] UPDATE Newsletter の記録に失敗しました", err);
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
