import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import PointRule from "@/models/PointRule";
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
    const rule = await PointRule.findByIdAndUpdate(id, body, { new: true });
    if (!rule) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    try {
      const AuditLog = (await import("@/models/AuditLog")).AuditLog;
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "UPDATE",
        resource: "PointRule",
        resourceId: id,
        detail: body,
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      });
    } catch (err) {
      console.error("[AuditLog] UPDATE PointRule の記録に失敗しました", err);
    }

    return NextResponse.json({ success: true, data: rule });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
    const rule = await PointRule.findByIdAndDelete(id);
    if (!rule) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    try {
      const AuditLog = (await import("@/models/AuditLog")).AuditLog;
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "DELETE",
        resource: "PointRule",
        resourceId: id,
        detail: { name: rule.name },
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      });
    } catch (err) {
      console.error("[AuditLog] DELETE PointRule の記録に失敗しました", err);
    }

    return NextResponse.json({ success: true, data: { id } });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
