import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import { Admin } from "@/models/Admin";
import type { AdminRole } from "@/models/Admin";
import { requireRole, SUPER_ADMIN_ONLY } from "@/lib/authz";

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
  const forbidden = requireRole(session, SUPER_ADMIN_ONLY);
  if (forbidden) return forbidden;

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();

    const allowedFields: Array<
      keyof {
        name: string;
        role: AdminRole;
        twoFactorEnabled: boolean;
        isActive: boolean;
      }
    > = ["name", "role", "twoFactorEnabled", "isActive"];
    const update: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) update[field] = body[field];
    }

    const admin = await Admin.findByIdAndUpdate(id, update, {
      new: true,
    }).select("-passwordHash -twoFactorSecret");
    if (!admin) {
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
        resource: "Admin",
        resourceId: id,
        detail: update,
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      });
    } catch (err) {
      console.error("[AuditLog] UPDATE Admin の記録に失敗しました", err);
    }

    const data = { ...admin.toObject(), id: admin._id.toString() };
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
  const forbidden = requireRole(session, SUPER_ADMIN_ONLY);
  if (forbidden) return forbidden;

  try {
    await connectDB();
    const { id } = await params;

    // 自分自身を無効化できないようにする
    if (id === session.user.id) {
      return NextResponse.json(
        { success: false, error: "Cannot deactivate yourself" },
        { status: 400 },
      );
    }

    // 物理削除せずisActive: falseに設定
    const admin = await Admin.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true },
    ).select("-passwordHash -twoFactorSecret");

    if (!admin) {
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
        resource: "Admin",
        resourceId: id,
        detail: { email: admin.email, name: admin.name },
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      });
    } catch (err) {
      console.error("[AuditLog] DELETE Admin の記録に失敗しました", err);
    }

    const data = { ...admin.toObject(), id: admin._id.toString() };
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
