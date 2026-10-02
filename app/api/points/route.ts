import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/db";
import PointRule from "@/models/PointRule";
import { requireRole, WRITE_ROLES } from "@/lib/authz";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    await connectDB();
    const docs = await PointRule.find()
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    const data = docs.map((d) => ({
      id: (d._id as { toString(): string }).toString(),
      name: d.name,
      type: d.type,
      points: d.points,
      condition: d.condition ?? "",
      isActive: d.isActive,
      updatedAt:
        d.updatedAt instanceof Date
          ? d.updatedAt.toISOString().slice(0, 10)
          : String(d.updatedAt),
    }));
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: true, data: [] });
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
    const rule = await PointRule.create(body);

    try {
      const AuditLog = (await import("@/models/AuditLog")).AuditLog;
      await AuditLog.create({
        adminId: session.user.id,
        adminEmail: session.user.email,
        action: "CREATE",
        resource: "PointRule",
        resourceId: rule._id?.toString(),
        detail: { name: body.name, pointAmount: body.pointAmount },
        ipAddress: request.headers.get("x-forwarded-for") ?? "unknown",
      });
    } catch (err) {
      console.error("[AuditLog] CREATE PointRule の記録に失敗しました", err);
    }

    return NextResponse.json({ success: true, data: rule }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
